from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "deliverables"

PROJECT = "智行 CampusMind"
ORG = "智行项目组"
DATE = "2026年5月"


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def set_cell_margins(table, top=80, start=120, bottom=80, end=120):
    tbl_pr = table._tbl.tblPr
    tbl_cell_mar = tbl_pr.first_child_found_in("w:tblCellMar")
    if tbl_cell_mar is None:
        tbl_cell_mar = OxmlElement("w:tblCellMar")
        tbl_pr.append(tbl_cell_mar)
    for m, v in {"top": top, "start": start, "bottom": bottom, "end": end}.items():
        node = tbl_cell_mar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tbl_cell_mar.append(node)
        node.set(qn("w:w"), str(v))
        node.set(qn("w:type"), "dxa")


def set_table_width(table, widths):
    table.autofit = False
    for row in table.rows:
        for idx, width in enumerate(widths):
            if idx < len(row.cells):
                row.cells[idx].width = Cm(width)
    set_cell_margins(table)


def style_doc(doc, title):
    section = doc.sections[0]
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(2.54)
    section.right_margin = Cm(2.54)
    section.header_distance = Cm(1.25)
    section.footer_distance = Cm(1.25)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "宋体"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
    normal.font.size = Pt(11)
    normal.paragraph_format.line_spacing = 1.15
    normal.paragraph_format.space_after = Pt(6)

    for name, size, color, before, after in [
        ("Heading 1", 16, "2E74B5", 16, 8),
        ("Heading 2", 13, "2E74B5", 12, 6),
        ("Heading 3", 12, "1F4D78", 8, 4),
    ]:
        style = styles[name]
        style.font.name = "黑体"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "黑体")
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor.from_string(color)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    header = section.header.paragraphs[0]
    header.text = title
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    header.runs[0].font.size = Pt(9)
    header.runs[0].font.color.rgb = RGBColor(100, 100, 100)


def add_cover(doc, title, subtitle):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(120)
    r = p.add_run(title)
    r.bold = True
    r.font.name = "黑体"
    r._element.rPr.rFonts.set(qn("w:eastAsia"), "黑体")
    r.font.size = Pt(24)
    r.font.color.rgb = RGBColor.from_string("0B2545")

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(120)
    r = p.add_run(subtitle)
    r.font.name = "宋体"
    r._element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")
    r.font.size = Pt(14)
    r.font.color.rgb = RGBColor(80, 80, 80)

    table = doc.add_table(rows=4, cols=2)
    table.style = "Table Grid"
    set_table_width(table, [3.2, 8.5])
    rows = [("项目名称", PROJECT), ("编写单位", ORG), ("文档版本", "V1.0"), ("编写日期", DATE)]
    for row, (k, v) in zip(table.rows, rows):
        row.cells[0].text = k
        row.cells[1].text = v
        set_cell_shading(row.cells[0], "E8EEF5")
        for cell in row.cells:
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    doc.add_page_break()


def add_toc(doc, entries):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run("目录")
    r.bold = True
    r.font.name = "黑体"
    r._element.rPr.rFonts.set(qn("w:eastAsia"), "黑体")
    r.font.size = Pt(16)
    p.paragraph_format.space_after = Pt(12)

    for entry in entries:
        p = doc.add_paragraph(entry)
        p.paragraph_format.left_indent = Cm(0.4 if "." in entry or "．" in entry else 0)
        p.paragraph_format.space_after = Pt(3)
    doc.add_page_break()


def add_para(doc, text):
    doc.add_paragraph(text)


def add_bullets(doc, items):
    for item in items:
        doc.add_paragraph(item, style="List Bullet")


def add_numbers(doc, items):
    for item in items:
        doc.add_paragraph(item, style="List Number")


def add_table(doc, headers, rows, widths):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    set_table_width(table, widths)
    for idx, h in enumerate(headers):
        table.rows[0].cells[idx].text = h
        set_cell_shading(table.rows[0].cells[idx], "F2F4F7")
    for row in rows:
        cells = table.add_row().cells
        for idx, value in enumerate(row):
            cells[idx].text = value
            cells[idx].vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    return table


def save_doc(doc, filename):
    OUT.mkdir(exist_ok=True)
    path = OUT / filename
    doc.save(path)
    return path


def target_scope_doc():
    doc = Document()
    style_doc(doc, "系统目标与范围说明书")
    add_cover(doc, "系统目标与范围说明书", "智行 CampusMind")
    add_toc(doc, ["1. 项目名称", "2. 开发背景", "3. 项目目标", "4. 项目范围", "4.1 范围内功能", "4.2 范围外功能", "5. 初步设想"])

    doc.add_heading("1. 项目名称", 1)
    add_para(doc, f"本项目名称为“{PROJECT}”。系统面向湖北大学校园学习与生活场景，采用 Web 应用形式提供校园地图、建筑信息、建筑级聊天室、课程表管理与出发建议等服务。")

    doc.add_heading("2. 开发背景", 1)
    add_para(doc, "湖北大学学生在教学楼、图书馆、食堂、宿舍、体育馆等地点之间移动频繁，日常存在地点查找、到课时间判断、现场信息获取和课程提醒分散等问题。新生或不熟悉校园的学生尤其需要一个以校园空间为组织方式的信息入口。")
    add_para(doc, "现有信息主要分散在班级群、社团群、公众号和口头传播中，现场信息真实性难以判断，学生常常无法及时了解某栋建筑、某个教室或某个公共区域的临时状态。因此项目拟将校园地图、位置验证、地点聊天室和课程日程规划结合起来，形成轻量化智慧校园服务系统。")

    doc.add_heading("3. 项目目标", 1)
    add_numbers(doc, [
        "建立卡通化校园地图首页，支持主要建筑点位展示与点击进入。",
        "为每个建筑提供详情信息和建筑级聊天室，沉淀现场信息。",
        "通过浏览器定位能力判断用户是否位于建筑允许范围内，实现“可查看、近处可发言”的信息可信机制。",
        "提供个人课程表维护能力，并根据课程地点、当前地点和步行时间生成出发建议。",
        "提供管理员维护建筑信息、审核聊天内容和处理举报的基础能力。",
        "完成可演示、可扩展、便于后续接入统一身份认证和地图服务的 MVP。"
    ])

    doc.add_heading("4. 项目范围", 1)
    doc.add_heading("4.1 范围内功能", 2)
    add_table(doc, ["功能域", "主要内容"], [
        ("用户认证", "学生注册、登录、JWT 登录状态、普通用户与管理员角色区分。"),
        ("校园地图", "展示湖北大学卡通地图和主要建筑点位，支持进入建筑详情。"),
        ("建筑聊天室", "按建筑组织消息，用户可查看消息，处于建筑范围内时可匿名发言。"),
        ("定位验证", "通过浏览器 Geolocation API 获取坐标，按建筑坐标与半径判断发言权限。"),
        ("课程表", "支持课程新增、修改、删除和个人课程表查看。"),
        ("日程规划", "识别下一节课，估算步行时间，生成建议出发时间和提醒信息。"),
        ("后台管理", "维护建筑、查看与处理消息、处理举报、隐藏或删除违规内容。"),
    ], [3.2, 12.0])
    doc.add_heading("4.2 范围外功能", 2)
    add_bullets(doc, [
        "第一版不实现室内精确定位，仅做建筑级位置判断。",
        "第一版不接入学校统一身份认证，采用模拟账号体系。",
        "第一版不实现复杂 AI 大模型推荐，采用规则算法完成出发建议。",
        "第一版不录入全校全部地点，优先覆盖主要教学、生活和公共建筑。",
        "第一版不开发原生 App，优先支持移动端浏览器和桌面浏览器。"
    ])

    doc.add_heading("5. 初步设想", 1)
    add_para(doc, "系统采用前后端分离架构。前端使用 Vue 3 + Vite 构建地图、建筑详情、聊天、课程表和后台页面；后端使用 FastAPI 提供 REST API 与 WebSocket 服务；数据库首期采用 SQLite，后续预留 MySQL 迁移空间。")
    add_para(doc, "第一阶段重点完成“登录 -> 校园地图 -> 建筑详情 -> 建筑聊天室 -> 定位发言 -> 课程表 -> 出发建议”的闭环。后续可扩展食堂排队信息、图书馆座位状态、校园活动聚合、统一身份认证、真实地图服务和更精细化提醒。")
    return save_doc(doc, "01_智行_系统目标与范围说明书.docx")


def feasibility_doc():
    doc = Document()
    style_doc(doc, "可行性研究报告")
    add_cover(doc, "可行性研究报告", "智行 CampusMind")
    add_toc(doc, [
        "1．引言", "1.1 编写目的", "1.2 项目背景", "1.3 定义", "1.4 参考资料",
        "2．可行性研究的前提", "3．对现有系统的分析", "4．所建议技术可行性分析",
        "5．所建议系统经济可行性分析", "6．社会因素可行性分析", "7．其他可供选择的方案", "8．结论意见"
    ])

    doc.add_heading("1．引言", 1)
    doc.add_heading("1.1 编写目的", 2)
    add_para(doc, "本文用于分析智行 CampusMind 的建设必要性、技术可行性、经济可行性、社会可行性和实施风险，为课程设计立项、开发范围确认和后续迭代提供依据。")
    doc.add_heading("1.2 项目背景", 2)
    add_para(doc, "校园学习生活具有强空间属性，学生经常需要在多个建筑之间切换，并依赖即时信息判断出发时间、地点状态和课程安排。传统信息渠道分散，不能围绕建筑和时间形成统一服务入口。")
    doc.add_heading("1.3 定义", 2)
    add_table(doc, ["术语", "说明"], [
        ("建筑级定位", "以建筑坐标和允许半径判断用户是否在建筑附近，不涉及室内精确定位。"),
        ("建筑聊天室", "以校园建筑为单位组织的匿名消息频道。"),
        ("MVP", "最小可运行产品，用于验证核心业务闭环。"),
        ("JWT", "用于接口鉴权和登录状态维护的令牌机制。"),
    ], [3.2, 10.8])
    doc.add_heading("1.4 参考资料", 2)
    add_numbers(doc, [
        "《智行 CampusMind 项目概述》",
        "《智行 CampusMind 需求分析说明书》",
        "《智行 CampusMind 系统架构设计》",
        "《智行 CampusMind 数据库设计》",
        "课程提供的软件工程可行性研究报告模板与案例资料"
    ])

    doc.add_heading("2．可行性研究的前提", 1)
    doc.add_heading("2.1 要求", 2)
    add_para(doc, "系统应在课程设计周期内完成可演示版本，支持学生登录、地图浏览、建筑详情、建筑聊天、定位验证、课程表维护、出发建议和基础后台管理。系统应适配常见浏览器，并保证基础安全与数据可追溯。")
    doc.add_heading("2.2 目标", 2)
    add_numbers(doc, [
        "提高校园地点信息获取效率。",
        "减少学生因不清楚距离和出发时间导致的迟到风险。",
        "通过位置限定发言提升建筑现场信息真实性。",
        "为后续智慧校园能力扩展形成统一入口。"
    ])
    doc.add_heading("2.3 条件、假定和限制", 2)
    add_bullets(doc, [
        "开发团队具备基础 Web 前后端开发能力。",
        "首期部署场景为小范围课程演示和试用，目标同时在线人数控制在 50 人以内。",
        "定位能力依赖浏览器授权，定位失败时只允许查看消息。",
        "地图使用卡通底图与建筑点位，不依赖商业地图 SDK。"
    ])
    doc.add_heading("2.4 可行性研究方法", 2)
    add_para(doc, "本报告采用场景分析、功能分解、技术栈匹配、成本收益估算和风险评估方法，对项目从业务、技术、经济、社会和运维角度进行综合判断。")
    doc.add_heading("2.5 决定可行性的主要因素", 2)
    add_bullets(doc, [
        "功能范围是否控制在 MVP 内。",
        "定位、聊天、课程表和日程算法能否形成稳定闭环。",
        "前后端接口设计和数据库模型是否清晰。",
        "隐私保护、匿名展示和后台追溯是否平衡。",
        "课程周期内是否能完成开发、测试和演示。"
    ])

    doc.add_heading("3．对现有系统的分析", 1)
    doc.add_heading("3.1 处理流程和数据流程", 2)
    add_para(doc, "现有方式主要依赖班级群、社团群、公众号、线下问询和个人经验。学生需要在不同渠道之间切换，信息按人群或组织分散，不能直接按照“我现在在哪、我要去哪里、现场发生什么”组织。")
    add_table(doc, ["现有场景", "主要问题"], [
        ("查找建筑", "新生依赖询问或搜索，缺少直观校园入口。"),
        ("获取现场信息", "群聊信息范围有限，真实性和时效性难以判断。"),
        ("判断出发时间", "学生依赖经验估计，容易忽略距离、缓冲时间和当前状态。"),
        ("内容管理", "分散渠道中违规内容处理不统一，缺少后台追溯。"),
    ], [4.0, 10.0])
    doc.add_heading("3.3 费用支出", 2)
    add_para(doc, "现有方式几乎没有直接软件费用，但隐性成本体现在时间浪费、信息重复询问、迟到风险和管理效率不足。")
    doc.add_heading("3.4 人员", 2)
    add_para(doc, "现有信息维护依赖学生个人、班委、社团或老师临时转发，缺少统一角色和权限边界。")
    doc.add_heading("3.5 设备", 2)
    add_para(doc, "学生主要使用手机和电脑浏览器，具备访问 Web 系统的基础条件。")
    doc.add_heading("3.6 局限性", 2)
    add_para(doc, "现有模式无法把地图、课程表、位置验证和现场消息结合起来，也难以形成可沉淀、可治理、可扩展的数据基础。")

    doc.add_heading("4．所建议技术可行性分析", 1)
    doc.add_heading("4.1 对系统的简要描述", 2)
    add_para(doc, "建议系统采用 Vue 3 + Vite 前端、FastAPI 后端、SQLite 数据库、JWT 鉴权和浏览器 Geolocation API。系统以建筑为核心对象，围绕地图、聊天、定位和课程表构建业务流程。")
    doc.add_heading("4.2 处理流程和数据流程", 2)
    add_numbers(doc, [
        "用户登录后进入校园地图页，前端请求建筑列表并渲染点位。",
        "用户点击建筑进入详情页，读取建筑信息和聊天消息。",
        "用户发送消息前授权定位，后端校验距离是否在建筑半径内。",
        "课程表模块保存课程时间和教学地点，日程模块识别下一节课并计算出发建议。",
        "管理员通过后台维护建筑、处理消息和举报。"
    ])
    doc.add_heading("4.3 与现有系统比较的优越性", 2)
    add_table(doc, ["比较维度", "现有方式", "建议系统"], [
        ("信息组织", "按群聊或公众号分散", "按校园地图和建筑组织"),
        ("现场可信度", "依赖发言者自觉", "位置校验后允许发言"),
        ("日程规划", "个人手动估计", "系统结合课程地点和时间计算"),
        ("内容治理", "渠道分散，处理困难", "后台可审核、隐藏、追溯"),
    ], [3.0, 5.3, 5.3])
    doc.add_heading("4.4 采用建议系统可能带来的影响", 2)
    add_bullets(doc, [
        "对设备影响较小，普通手机和电脑浏览器即可使用。",
        "对现有软件影响较小，可作为独立 Web 系统运行。",
        "对用户影响积极，能降低查找地点和判断出发时间的成本。",
        "对运行方式影响可控，首期适合课程演示和小范围试用。"
    ])
    doc.add_heading("4.5 技术可行性评价", 2)
    add_para(doc, "项目核心功能均属于成熟 Web 应用范畴，前后端分离、数据库 CRUD、JWT 鉴权、浏览器定位、WebSocket/HTTP 聊天和规则计算均有成熟实现路径。只要严格控制 MVP 范围，技术上具备较高可行性。")

    doc.add_heading("5．所建议系统经济可行性分析", 1)
    doc.add_heading("5.1 支出", 2)
    add_table(doc, ["支出项", "说明"], [
        ("开发成本", "课程项目以团队开发投入为主，无需额外采购。"),
        ("运行成本", "本地演示可零成本运行；云端部署可使用轻量云服务器。"),
        ("维护成本", "主要为建筑数据维护、内容审核和版本迭代。"),
    ], [3.5, 10.5])
    doc.add_heading("5.2 效益", 2)
    add_bullets(doc, [
        "提升学生获取校园地点和现场信息的效率。",
        "降低迟到、迷路和重复询问带来的时间成本。",
        "形成可展示的软件工程课程设计成果。",
        "为智慧校园扩展功能提供基础数据与入口。"
    ])
    doc.add_heading("5.3 收益／投资比", 2)
    add_para(doc, "在课程项目和小范围试用场景下，系统以开源技术和轻量部署为主，投入成本较低，能够形成可演示成果和明确使用价值，收益投入比较高。")
    doc.add_heading("5.4 投资回收周期", 2)
    add_para(doc, "若用于课程设计，开发完成即可体现成果价值；若用于校园小范围试点，预计在一个学期内可通过使用反馈验证价值。")
    doc.add_heading("5.5 敏感性分析", 2)
    add_para(doc, "项目对功能范围和定位授权较敏感。若范围过大或定位授权率较低，会影响开发进度和聊天可信机制。因此首期应坚持建筑级定位和核心闭环优先。")

    doc.add_heading("6．社会因素可行性分析", 1)
    doc.add_heading("6.1 法律因素", 2)
    add_para(doc, "系统涉及账号、定位和聊天内容，应遵守个人信息保护、网络安全和数据安全相关要求。前台匿名展示不等于后台匿名，后台需保留必要追溯信息，并避免公开真实身份和精确位置轨迹。")
    doc.add_heading("6.2 用户使用可行性", 2)
    add_para(doc, "目标用户为高校学生，熟悉手机浏览器、地图和聊天类产品。系统采用地图入口和常见表单交互，学习成本较低。")
    doc.add_heading("7．其他可供选择的方案", 1)
    add_para(doc, "可选方案包括直接使用商业地图平台、开发原生 App 或仅做课程表工具。相比之下，本项目的 Web + 卡通地图方案开发成本更低、演示更直观，也更适合课程周期。")
    doc.add_heading("8．结论意见", 1)
    add_para(doc, "综合业务需求、技术成熟度、经济投入、社会影响和实施风险，智行 CampusMind 具备开发可行性。建议按 MVP 范围推进，优先完成核心闭环，再逐步扩展实时聊天、举报处理、统一身份认证和更多校园服务。")
    return save_doc(doc, "02_智行_可行性研究报告.docx")


def requirements_doc():
    doc = Document()
    style_doc(doc, "软件需求规格说明书")
    add_cover(doc, "软件需求规格说明书", "智行 CampusMind")
    add_toc(doc, ["1. 引言", "2. 总体描述", "3. 功能需求", "4. 非功能需求", "5. 数据需求", "6. 接口需求", "7. 验收标准"])

    doc.add_heading("1. 引言", 1)
    doc.add_heading("1.1 编写目的", 2)
    add_para(doc, "本文档用于明确智行 CampusMind 的功能需求、非功能需求、数据需求、接口需求和验收约束，为后续设计、编码、测试和验收提供依据。")
    doc.add_heading("1.2 项目范围", 2)
    add_para(doc, "系统首期范围为校园地图、建筑信息、建筑聊天室、定位验证、课程表、日程规划和基础管理后台。")
    doc.add_heading("1.3 用户角色", 2)
    add_table(doc, ["角色", "说明", "主要权限"], [
        ("学生用户", "系统主要使用者", "地图浏览、建筑详情、聊天查看、定位发言、课程表维护、日程建议"),
        ("管理员", "系统内容维护者", "学生功能、建筑管理、消息管理、举报处理"),
        ("未登录用户", "尚未完成认证的访问者", "仅可访问登录与注册入口"),
    ], [2.4, 4.0, 7.6])

    doc.add_heading("2. 总体描述", 1)
    doc.add_heading("2.1 产品视角", 2)
    add_para(doc, "本系统是面向校园场景的独立 Web 应用，可在后续与校园统一身份认证、商业地图服务、消息推送服务和学校数据平台对接。")
    doc.add_heading("2.2 产品功能概述", 2)
    add_bullets(doc, [
        "以校园地图为入口组织建筑与现场信息。",
        "以建筑聊天室承载地点相关即时信息。",
        "以定位验证约束发言权限，提高消息可信度。",
        "以课程表和日程规划提供出发建议。",
        "以后台管理保障基础数据维护和内容治理。"
    ])
    doc.add_heading("2.3 运行环境", 2)
    add_table(doc, ["类别", "要求"], [
        ("客户端", "Chrome、Edge、Android 手机浏览器、微信内置浏览器优先适配。"),
        ("前端", "Vue 3 + Vite。"),
        ("后端", "FastAPI、SQLAlchemy、Pydantic、JWT。"),
        ("数据库", "首期 SQLite，后续可迁移 MySQL。"),
        ("部署", "本地运行或 Nginx + Uvicorn，Docker 可选。"),
    ], [3.0, 11.0])

    doc.add_heading("3. 功能需求", 1)
    rows = [
        ("FR-001", "用户认证", "用户可以通过学号、用户名和密码注册。", "高"),
        ("FR-002", "用户认证", "用户可以通过学号或用户名登录系统。", "高"),
        ("FR-003", "用户认证", "系统使用 JWT 维护登录状态。", "高"),
        ("FR-004", "用户认证", "用户分为普通学生和管理员两种角色。", "高"),
        ("FR-005", "校园地图", "系统首页展示湖北大学卡通化校园地图。", "高"),
        ("FR-006", "校园地图", "地图上展示主要建筑点位。", "高"),
        ("FR-007", "校园地图", "用户点击建筑点后进入建筑详情页。", "高"),
        ("FR-008", "校园地图", "用户可以查看建筑名称、类型、简介、位置等信息。", "中"),
        ("FR-009", "建筑聊天室", "每个建筑拥有一个默认聊天室。", "高"),
        ("FR-010", "建筑聊天室", "每个建筑可以包含多个室内频道。", "中"),
        ("FR-011", "建筑聊天室", "用户可以查看某建筑的聊天消息。", "高"),
        ("FR-012", "建筑聊天室", "用户在建筑允许范围内时可以匿名发送消息。", "高"),
        ("FR-013", "建筑聊天室", "用户不在建筑允许范围内时只能查看消息。", "高"),
        ("FR-014", "建筑聊天室", "聊天室消息前台显示为匿名同学。", "中"),
        ("FR-015", "建筑聊天室", "后台数据库必须保存真实 user_id 用于违规追溯。", "高"),
        ("FR-016", "定位判断", "系统通过浏览器 Geolocation API 获取用户当前位置。", "高"),
        ("FR-017", "定位判断", "系统根据用户坐标和建筑坐标计算距离。", "高"),
        ("FR-018", "定位判断", "距离小于等于建筑 radius 时允许发言。", "高"),
        ("FR-019", "定位判断", "定位失败时用户只能查看消息，不能发言。", "高"),
        ("FR-020", "课程表", "用户可以添加课程。", "高"),
        ("FR-021", "课程表", "用户可以修改课程。", "高"),
        ("FR-022", "课程表", "用户可以删除课程。", "高"),
        ("FR-023", "课程表", "用户可以查看个人课程表。", "高"),
        ("FR-024", "课程表", "课程包含课程名、星期、开始时间、结束时间、教学建筑、教室、教师等信息。", "高"),
        ("FR-025", "日程规划", "系统可以识别用户当天下一节课。", "高"),
        ("FR-026", "日程规划", "系统可以计算当前位置到下一节课建筑的大致距离。", "高"),
        ("FR-027", "日程规划", "系统根据距离、步行速度和缓冲时间计算建议出发时间。", "高"),
        ("FR-028", "日程规划", "系统可以在建议出发时间前提醒用户。", "中"),
        ("FR-029", "日程规划", "用户可以输入临时事项，系统给出简单规划建议。", "低"),
        ("FR-030", "管理后台", "管理员可以新增、修改、删除建筑信息。", "高"),
        ("FR-031", "管理后台", "管理员可以查看聊天消息。", "高"),
        ("FR-032", "管理后台", "管理员可以隐藏或删除违规消息。", "高"),
        ("FR-033", "管理后台", "用户可以举报消息。", "中"),
        ("FR-034", "管理后台", "管理员可以处理举报。", "中"),
    ]
    add_table(doc, ["编号", "模块", "需求描述", "优先级"], rows, [2.0, 2.8, 8.0, 1.6])

    doc.add_heading("4. 非功能需求", 1)
    add_table(doc, ["类别", "需求"], [
        ("易用性", "界面简洁，适合学生在手机浏览器中使用；常用入口不超过三次点击。"),
        ("性能", "第一版支持小范围测试，目标同时在线 50 人以内，常规接口响应时间保持在可接受范围内。"),
        ("安全性", "密码哈希保存，管理员接口鉴权，前台匿名后台可追溯，聊天消息基础敏感词过滤。"),
        ("可扩展性", "预留统一身份认证、MySQL、商业地图 API、复杂推荐算法和消息推送接入空间。"),
        ("兼容性", "优先适配 Chrome、Edge、Android 手机浏览器和微信内置浏览器。"),
        ("可部署性", "支持本地运行和云服务器部署。"),
    ], [3.0, 11.0])

    doc.add_heading("5. 数据需求", 1)
    add_table(doc, ["数据对象", "关键字段"], [
        ("用户", "id、student_no、username、password_hash、nickname、role、created_at"),
        ("建筑", "id、name、type、description、latitude、longitude、radius、map_x、map_y"),
        ("频道", "id、building_id、name、description"),
        ("消息", "id、building_id、channel_id、user_id、content、latitude、longitude、status、created_at"),
        ("课程", "id、user_id、course_name、weekday、start_time、end_time、building_id、classroom、teacher"),
        ("举报", "id、message_id、reporter_id、reason、status、created_at、handled_at"),
    ], [3.0, 11.0])

    doc.add_heading("6. 接口需求", 1)
    add_table(doc, ["接口类别", "示例接口", "说明"], [
        ("认证接口", "POST /api/auth/register；POST /api/auth/login", "注册、登录并返回 token。"),
        ("建筑接口", "GET /api/buildings；GET /api/buildings/{id}", "获取建筑列表与详情。"),
        ("聊天接口", "GET /api/buildings/{id}/messages；POST /api/messages", "读取和发送建筑消息。"),
        ("课程接口", "GET/POST/PUT/DELETE /api/courses", "管理个人课程表。"),
        ("日程接口", "GET /api/schedule/next", "获取下一节课与建议出发时间。"),
        ("后台接口", "/api/admin/*", "建筑、消息和举报管理。"),
        ("WebSocket", "WS /ws/chat/{building_id}/{channel_id}?token=<jwt_token>", "实时聊天增强接口。"),
    ], [3.0, 5.4, 5.6])

    doc.add_heading("7. 验收标准", 1)
    add_bullets(doc, [
        "用户能够完成注册、登录并进入地图首页。",
        "地图展示主要建筑点位，点击后能进入建筑详情。",
        "用户能查看建筑聊天室消息，定位在允许范围内时能发言。",
        "课程表支持增删改查，系统能识别下一节课并给出出发建议。",
        "管理员可以维护建筑信息并处理聊天内容。",
        "系统可在本地环境完整运行，README 和部署说明清晰。"
    ])
    return save_doc(doc, "03_智行_软件需求规格说明书.docx")


def use_case_doc():
    doc = Document()
    style_doc(doc, "功能结构与用例分析说明书")
    add_cover(doc, "功能结构与用例分析说明书", "智行 CampusMind")
    add_toc(doc, ["1 文档说明", "2 系统总体结构设计", "3 分模块用例分析", "4 总体 UML 用例汇总表", "5 结语"])

    doc.add_heading("1 文档说明", 1)
    doc.add_heading("1.1 角色定义", 2)
    add_table(doc, ["角色", "定义"], [
        ("学生用户", "系统主要服务对象，使用地图、建筑信息、聊天、课程表和日程建议。"),
        ("管理员", "负责建筑数据维护、消息审核、举报处理和基础配置。"),
        ("浏览器定位服务", "外部能力，向系统提供用户当前位置。"),
    ], [3.2, 10.8])
    doc.add_heading("1.2 文档使用说明", 2)
    add_para(doc, "本文档用于描述系统功能模块、角色关系和关键用例，为页面设计、接口设计、开发任务拆分和测试用例设计提供依据。")

    doc.add_heading("2 系统总体结构设计", 1)
    doc.add_heading("2.1 一级模块划分", 2)
    add_table(doc, ["一级模块", "模块职责"], [
        ("用户与权限管理", "注册、登录、JWT 鉴权、角色识别。"),
        ("校园地图与建筑信息", "地图首页、建筑点位、建筑详情和建筑基础数据。"),
        ("建筑聊天室与位置验证", "建筑频道、消息查看、定位校验、匿名发言、举报。"),
        ("课程表与日程规划", "课程维护、下一节课识别、步行时间估算、出发提醒。"),
        ("后台管理与内容治理", "建筑维护、消息审核、举报处理、管理员权限控制。"),
    ], [4.0, 10.0])
    doc.add_heading("2.2 系统功能结构树", 2)
    add_para(doc, "智行 CampusMind")
    add_bullets(doc, [
        "用户与权限管理：注册、登录、JWT 鉴权、角色识别。",
        "校园地图与建筑信息：地图展示、建筑点位、建筑详情、建筑维护。",
        "建筑聊天室与位置验证：消息列表、匿名发言、定位判断、频道管理、举报。",
        "课程表与日程规划：课程增删改查、下一节课识别、出发时间计算、提醒。",
        "后台管理与内容治理：建筑管理、消息管理、举报处理、数据维护。"
    ])
    doc.add_heading("2.3 系统总体用例说明", 2)
    add_para(doc, "学生用户围绕地图、建筑、聊天和课程表进行日常使用；管理员在后台维护基础数据和内容秩序；浏览器定位服务为发言权限判断和出发建议提供当前位置数据。")

    modules = [
        ("3.1 用户与权限管理", "负责用户身份建立、登录状态维护和角色权限识别。", [
            ("UC01", "注册账号", "学生用户", "填写学号、用户名、密码和昵称，系统创建学生账号。"),
            ("UC02", "登录系统", "学生用户/管理员", "输入学号或用户名和密码，系统返回 JWT token 并进入对应首页。"),
            ("UC03", "角色识别", "系统", "系统根据用户 role 判断是否可访问管理后台。"),
        ]),
        ("3.2 校园地图与建筑信息", "负责以校园空间组织信息，提供建筑点位和建筑详情入口。", [
            ("UC04", "查看校园地图", "学生用户", "用户进入首页后查看卡通化校园地图和主要建筑点位。"),
            ("UC05", "查看建筑详情", "学生用户", "点击建筑点位后查看名称、类型、简介和位置等信息。"),
            ("UC06", "维护建筑信息", "管理员", "管理员新增、修改或删除建筑基础数据。"),
        ]),
        ("3.3 建筑聊天室与位置验证", "负责建筑级消息查看、定位校验、匿名发言和违规治理。", [
            ("UC07", "查看建筑消息", "学生用户", "进入建筑聊天室后读取历史消息和频道消息。"),
            ("UC08", "定位后匿名发言", "学生用户/浏览器定位服务", "用户授权定位，系统校验距离，符合范围后保存并展示匿名消息。"),
            ("UC09", "举报消息", "学生用户", "用户对违规消息提交举报原因。"),
            ("UC10", "处理消息与举报", "管理员", "管理员隐藏或删除违规消息，并处理举报记录。"),
        ]),
        ("3.4 课程表与日程规划", "负责个人课程维护、下一节课识别和出发建议计算。", [
            ("UC11", "维护课程表", "学生用户", "用户新增、修改、删除并查看个人课程。"),
            ("UC12", "获取出发建议", "学生用户/浏览器定位服务", "系统读取当前位置和下一节课地点，计算建议出发时间。"),
            ("UC13", "接收提醒", "学生用户", "系统在建议出发时间前展示提醒信息。"),
        ]),
        ("3.5 后台管理与统计治理", "负责系统基础数据维护和内容治理支撑。", [
            ("UC14", "查看后台数据", "管理员", "管理员查看建筑、消息、举报等基础数据。"),
            ("UC15", "内容审核", "管理员", "管理员对违规消息执行隐藏、删除或保留处理。"),
        ]),
    ]
    doc.add_heading("3 分模块用例分析", 1)
    for heading, desc, cases in modules:
        doc.add_heading(heading, 2)
        doc.add_heading("模块职责与边界", 3)
        add_para(doc, desc)
        doc.add_heading("子功能清单", 3)
        add_table(doc, ["用例编号", "用例名称", "参与者", "简要说明"], cases, [2.1, 3.2, 3.2, 5.5])
        doc.add_heading("关键用例描述", 3)
        for uc, name, actor, summary in cases:
            doc.add_heading(f"{uc} {name}", 4)
            add_table(doc, ["项目", "内容"], [
                ("参与者", actor),
                ("前置条件", "用户已满足进入该功能的基本权限要求。"),
                ("基本流程", summary),
                ("异常流程", "权限不足、定位失败、参数错误或网络异常时，系统给出明确提示并保持数据一致。"),
                ("后置条件", "系统完成相应数据读取、写入或状态更新。"),
            ], [2.5, 11.5])

    doc.add_heading("4 总体 UML 用例汇总表", 1)
    all_cases = []
    for _, _, cases in modules:
        all_cases.extend(cases)
    add_table(doc, ["编号", "用例名称", "主要参与者", "所属模块"], [
        (uc, name, actor, next(m[0].split(" ", 1)[1] for m in modules if (uc, name, actor, summary) in m[2]))
        for uc, name, actor, summary in all_cases
    ], [2.0, 3.5, 4.0, 4.5])
    doc.add_heading("5 结语", 1)
    add_para(doc, "本说明书将系统能力划分为地图、建筑、聊天、定位、课程、日程和后台治理等模块，覆盖学生日常使用与管理员维护场景。后续开发可按用例优先级推进，并将关键用例转化为接口任务、页面任务和测试用例。")
    return save_doc(doc, "04_智行_功能结构与用例分析说明书.docx")


def main():
    paths = [
        target_scope_doc(),
        feasibility_doc(),
        requirements_doc(),
        use_case_doc(),
    ]
    for path in paths:
        print(path)


if __name__ == "__main__":
    main()
