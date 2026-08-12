"""Collapse account identity to student ID and add stable token subjects."""

import secrets
import sqlalchemy as sa
from alembic import op


revision = "20260812_09"
down_revision = "20260809_08"
branch_labels = None
depends_on = None


def _normalized_identities() -> list[tuple[int, str]]:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT id, student_id, username FROM users ORDER BY id")
    ).mappings()
    normalized: list[tuple[int, str]] = []
    seen: set[str] = set()
    for row in rows:
        student_id = (row["student_id"] or "").strip()
        username = (row["username"] or "").strip()
        canonical = student_id or username
        if not 3 <= len(canonical) <= 32:
            raise RuntimeError(
                "Cannot normalize student_id: every value must contain 3 to 32 "
                "characters after trimming"
            )
        if canonical in seen:
            raise RuntimeError(
                "Cannot normalize student_id: trimmed or backfilled values are not unique"
            )
        seen.add(canonical)
        normalized.append((int(row["id"]), canonical))
    return normalized


def _temporary_usernames(
    identities: list[tuple[int, str]],
) -> dict[int, str]:
    connection = op.get_bind()
    reserved = {
        str(value)
        for value in connection.scalars(sa.text("SELECT username FROM users"))
    }
    reserved.update(student_id for _, student_id in identities)
    for _ in range(10):
        prefix = f"__cm09_tmp_{secrets.token_hex(16)}_"
        candidates = {user_id: f"{prefix}{user_id}" for user_id, _ in identities}
        values = set(candidates.values())
        if all(len(value) <= 64 for value in values) and values.isdisjoint(reserved):
            return candidates
    raise RuntimeError("Cannot allocate temporary account identities")


def _token_subjects(identities: list[tuple[int, str]]) -> dict[int, str]:
    subjects: dict[int, str] = {}
    used: set[str] = set()
    for user_id, _ in identities:
        subject = secrets.token_hex(16)
        while subject in used:
            subject = secrets.token_hex(16)
        used.add(subject)
        subjects[user_id] = subject
    return subjects


def _normalize_student_identities(
    identities: list[tuple[int, str]],
    temporary_usernames: dict[int, str],
    token_subjects: dict[int, str],
) -> None:
    connection = op.get_bind()
    for user_id, student_id in identities:
        connection.execute(
            sa.text("UPDATE users SET student_id = :student_id WHERE id = :user_id"),
            {"student_id": student_id, "user_id": user_id},
        )
    for user_id, temporary_username in temporary_usernames.items():
        connection.execute(
            sa.text("UPDATE users SET username = :username WHERE id = :user_id"),
            {"username": temporary_username, "user_id": user_id},
        )
    for user_id, student_id in identities:
        connection.execute(
            sa.text(
                "UPDATE users SET username = :student_id, token_subject = :token_subject "
                "WHERE id = :user_id"
            ),
            {
                "student_id": student_id,
                "token_subject": token_subjects[user_id],
                "user_id": user_id,
            },
        )


def upgrade() -> None:
    identities = _normalized_identities()
    temporary_usernames = _temporary_usernames(identities)
    token_subjects = _token_subjects(identities)

    op.add_column(
        "users",
        sa.Column("token_subject", sa.String(length=32), nullable=True),
    )
    _normalize_student_identities(
        identities,
        temporary_usernames,
        token_subjects,
    )
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "student_id",
            existing_type=sa.String(length=32),
            existing_nullable=True,
            nullable=False,
        )
        batch_op.alter_column(
            "token_subject",
            existing_type=sa.String(length=32),
            existing_nullable=True,
            nullable=False,
        )
        batch_op.create_check_constraint(
            "ck_users_username_matches_student_id",
            "username = student_id",
        )
    op.create_index(
        "ix_users_token_subject",
        "users",
        ["token_subject"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_users_token_subject", table_name="users")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint(
            "ck_users_username_matches_student_id",
            type_="check",
        )
        batch_op.alter_column(
            "student_id",
            existing_type=sa.String(length=32),
            existing_nullable=False,
            nullable=True,
        )
        # Historical usernames were intentionally collapsed during upgrade and
        # cannot be reconstructed on downgrade.
        batch_op.drop_column("token_subject")
