"""Create the application's pre-core-journey baseline schema."""

from alembic import op
import sqlalchemy as sa


revision = "20260720_00"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.String(length=32), nullable=True),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("nickname", sa.String(length=64), nullable=False),
        sa.Column("avatar_text", sa.String(length=4), nullable=True),
        sa.Column("avatar_color", sa.String(length=16), nullable=True),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_id", "users", ["id"], unique=False)
    op.create_index("ix_users_student_id", "users", ["student_id"], unique=True)
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    op.create_table(
        "buildings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("map_x", sa.Float(), nullable=False),
        sa.Column("map_y", sa.Float(), nullable=False),
        sa.Column("walk_hint", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_buildings_id", "buildings", ["id"], unique=False)
    op.create_index("ix_buildings_name", "buildings", ["name"], unique=True)
    op.create_index("ix_buildings_type", "buildings", ["type"], unique=False)

    op.create_table(
        "courses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("course_name", sa.String(length=100), nullable=False),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.String(length=5), nullable=False),
        sa.Column("end_time", sa.String(length=5), nullable=False),
        sa.Column("building_id", sa.Integer(), nullable=False),
        sa.Column("room_name", sa.String(length=64), nullable=False),
        sa.Column("teacher", sa.String(length=64), nullable=True),
        sa.Column("weeks", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_courses_building_id", "courses", ["building_id"], unique=False)
    op.create_index("ix_courses_course_name", "courses", ["course_name"], unique=False)
    op.create_index("ix_courses_id", "courses", ["id"], unique=False)
    op.create_index("ix_courses_user_id", "courses", ["user_id"], unique=False)
    op.create_index("ix_courses_weekday", "courses", ["weekday"], unique=False)

    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("building_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("display_name", sa.String(length=64), nullable=False),
        sa.Column("room_name", sa.String(length=64), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("location_source", sa.String(length=32), nullable=True),
        sa.Column("distance_to_building_meters", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_messages_building_id", "messages", ["building_id"], unique=False)
    op.create_index("ix_messages_id", "messages", ["id"], unique=False)
    op.create_index("ix_messages_room_name", "messages", ["room_name"], unique=False)
    op.create_index("ix_messages_status", "messages", ["status"], unique=False)
    op.create_index("ix_messages_user_id", "messages", ["user_id"], unique=False)

    op.create_table(
        "location_presets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("building_id", sa.Integer(), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_location_presets_building_id", "location_presets", ["building_id"], unique=False)
    op.create_index("ix_location_presets_id", "location_presets", ["id"], unique=False)
    op.create_index("ix_location_presets_name", "location_presets", ["name"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_location_presets_name", table_name="location_presets")
    op.drop_index("ix_location_presets_id", table_name="location_presets")
    op.drop_index("ix_location_presets_building_id", table_name="location_presets")
    op.drop_table("location_presets")
    op.drop_index("ix_messages_user_id", table_name="messages")
    op.drop_index("ix_messages_status", table_name="messages")
    op.drop_index("ix_messages_room_name", table_name="messages")
    op.drop_index("ix_messages_id", table_name="messages")
    op.drop_index("ix_messages_building_id", table_name="messages")
    op.drop_table("messages")
    op.drop_index("ix_courses_weekday", table_name="courses")
    op.drop_index("ix_courses_user_id", table_name="courses")
    op.drop_index("ix_courses_id", table_name="courses")
    op.drop_index("ix_courses_course_name", table_name="courses")
    op.drop_index("ix_courses_building_id", table_name="courses")
    op.drop_table("courses")
    op.drop_index("ix_buildings_type", table_name="buildings")
    op.drop_index("ix_buildings_name", table_name="buildings")
    op.drop_index("ix_buildings_id", table_name="buildings")
    op.drop_table("buildings")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_index("ix_users_student_id", table_name="users")
    op.drop_index("ix_users_id", table_name="users")
    op.drop_table("users")
