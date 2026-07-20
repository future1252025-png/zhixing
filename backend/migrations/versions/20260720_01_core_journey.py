"""Add versioned core user journey persistence."""

from alembic import op
import sqlalchemy as sa


revision = "20260720_01"
down_revision = "20260720_00"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE courses SET weeks = '1-20' WHERE weeks IS NULL OR TRIM(weeks) = ''")
    with op.batch_alter_table("courses") as batch_op:
        batch_op.alter_column(
            "weeks",
            existing_type=sa.String(length=64),
            nullable=False,
            server_default="1-20",
        )
        batch_op.add_column(
            sa.Column(
                "source_kind",
                sa.String(length=16),
                nullable=False,
                server_default="manual",
            )
        )

    op.create_table(
        "semester_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("total_weeks", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_semester_settings_id", "semester_settings", ["id"], unique=False)
    op.create_index("ix_semester_settings_user_id", "semester_settings", ["user_id"], unique=True)

    op.create_table(
        "course_import_sources",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("course_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=True),
        sa.Column("file_sha256", sa.String(length=64), nullable=True),
        sa.Column("source_row", sa.String(length=80), nullable=True),
        sa.Column("raw_course_name", sa.Text(), nullable=False),
        sa.Column("raw_weekday", sa.Text(), nullable=False),
        sa.Column("raw_time_or_section", sa.Text(), nullable=False),
        sa.Column("raw_teacher", sa.Text(), nullable=False),
        sa.Column("raw_weeks", sa.Text(), nullable=False),
        sa.Column("raw_location", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["course_id"], ["courses.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_course_import_sources_course_id", "course_import_sources", ["course_id"], unique=True)
    op.create_index("ix_course_import_sources_file_sha256", "course_import_sources", ["file_sha256"], unique=False)
    op.create_index("ix_course_import_sources_id", "course_import_sources", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_course_import_sources_id", table_name="course_import_sources")
    op.drop_index("ix_course_import_sources_file_sha256", table_name="course_import_sources")
    op.drop_index("ix_course_import_sources_course_id", table_name="course_import_sources")
    op.drop_table("course_import_sources")
    op.drop_index("ix_semester_settings_user_id", table_name="semester_settings")
    op.drop_index("ix_semester_settings_id", table_name="semester_settings")
    op.drop_table("semester_settings")
    with op.batch_alter_table("courses") as batch_op:
        batch_op.drop_column("source_kind")
        batch_op.alter_column(
            "weeks",
            existing_type=sa.String(length=64),
            nullable=True,
            server_default=None,
        )
