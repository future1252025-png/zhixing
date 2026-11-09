"""Bind native map POIs to stable existing building/channel identities."""
from alembic import op
import sqlalchemy as sa

revision = "20260910_11"
down_revision = "20260908_10"
branch_labels = None
depends_on = None

# Verified against live AMap PlaceSearch on 2026-09-10: exact unique names,
# converted coordinates agree within 15 m (observed ~1 m). Frozen here so later
# seed edits cannot silently change this migration or reassign historic rooms.
VERIFIED_POIS = (
    ("湖北大学(武昌校区)", 30.579833, 114.328253, "B001B06EAF"),
    ("湖北大学武昌校区生命科学学院", 30.582913, 114.328053, "B001B1IGJV"),
    ("湖北大学武昌校区国际教育学院", 30.580369, 114.326941, "B001B1CXFR"),
    ("湖北大学曼城联合学院", 30.580292, 114.326884, "B0H32H3ZZF"),
    ("湖北大学武昌校区体育学院", 30.581765, 114.327123, "B001B1CXGW"),
    ("湖北大学武昌校区艺术学院", 30.579338, 114.327366, "B001B1BY2I"),
    ("湖北大学武昌校区化学化工学院", 30.58221, 114.328128, "B001B1CXH5"),
    ("湖北大学武昌校区计算机学院", 30.580086, 114.32662, "B0FFK0F6FR"),
    ("湖北大学武昌校区历史文化学院", 30.577993, 114.325041, "B001B1HC04"),
    ("湖北大学文创中心", 30.577743, 114.326094, "B0FFF4EWHV"),
    ("湖北大学-习坎楼", 30.578604, 114.324881, "B0JBA5C4U1"),
    ("湖北大学-会议中心(宝积路)", 30.580687, 114.329203, "B001B0IP8O"),
    ("湖北大学武昌校区资源环境学院", 30.579718, 114.327715, "B001B1CXGV"),
    ("湖北大学武昌校区材料科学与工程学院", 30.583204, 114.328467, "B001B1CXQZ"),
    ("湖北大学武昌校区马克思主义学院", 30.580809, 114.326379, "B001B1E4YE"),
    ("湖北大学(武昌主校区四区5栋)", 30.578693, 114.328945, "B0M6P7MNTD"),
    ("湖北大学-风华园", 30.582087, 114.331956, "B0FFFDBXJC"),
    ("湖北大学武昌校区学生宿舍(建设中)", 30.582605, 114.331009, "B001B0IPE6"),
    ("湖北大学红墙琴园酒店", 30.578058, 114.324544, "B0K10AS8I0"),
    ("湖北大学(武昌主校区)-教4", 30.579603, 114.324753, "B0LKYB395O"),
    ("湖北大学(武昌主校区)双创大楼A座", 30.579096, 114.323894, "B0LA4R9TEQ"),
    ("湖北大学武昌校区诚信公寓", 30.58063, 114.332431, "B0FFI958EW"),
    ("海文考研·保研(湖北大学校区)", 30.578047, 114.327709, "B0FFL4R2SU"),
    ("湖北大学团结学生公寓", 30.576011, 114.328231, "B0KKKCU3WL"),
    ("湖北大学(武昌主校区)-嘉会园小吃城", 30.577602, 114.327062, "B0FFH1K0KF"),
    ("湖北大学武昌校区二期公寓", 30.576399, 114.326738, "B001B0ITE5"),
    ("湖北大学武昌校区1号体育馆", 30.579271, 114.330728, "B0G2MHWXCE"),
    ("湖北大学(武昌主校区)创新创业大楼", 30.57948, 114.324395, "B0L1M1I2ZM"),
    ("湖北大学武昌校区武汉粘接学会", 30.582329, 114.328273, "B0J6PH3V2J"),
    ("湖北大学武昌校区图书馆", 30.581091, 114.329114, "B001B0IPJP"),
)


def upgrade() -> None:
    op.create_table(
        "building_map_pois",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("building_id", sa.Integer(), sa.ForeignKey("buildings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("poi_id", sa.String(80), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.UniqueConstraint("provider", "poi_id", name="uq_building_map_poi_identity"),
    )
    op.create_index("ix_building_map_pois_building_id", "building_map_pois", ["building_id"])
    connection = op.get_bind()
    for name, latitude, longitude, poi_id in VERIFIED_POIS:
        matches = connection.execute(sa.text(
            "SELECT id FROM buildings WHERE name = :name "
            "AND ABS(latitude - :latitude) < 0.0001 "
            "AND ABS(longitude - :longitude) < 0.0001"
        ), {"name": name, "latitude": latitude, "longitude": longitude}).scalars().all()
        if len(matches) == 1:
            connection.execute(sa.text(
                "INSERT INTO building_map_pois (building_id, provider, poi_id, name) "
                "VALUES (:building_id, 'amap', :poi_id, :name)"
            ), {"building_id": matches[0], "poi_id": poi_id, "name": name})


def downgrade() -> None:
    op.drop_table("building_map_pois")
