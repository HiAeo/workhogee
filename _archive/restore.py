# -*- coding: utf-8 -*-
"""一键复原：把 _archive 内的旧产品页面复制回仓库原路径。
运行前自动快照当前(二手车)首页，防止误操作丢失现网版本。"""
import os, shutil, datetime, sys

ARCH = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(ARCH)

# 归档文件(相对 _archive) -> 原路径(相对项目根)
MAP = [
    ("ai-huoke-home.html",        "index.html"),
    ("geo-huoji.html",            "geo.html"),
    ("global-huoji.html",         "global.html"),
    ("agent-builder-huoji.html",  "agent-builder.html"),
    ("internal-roadmap.html",     "产品状态盘点与开发排期.html"),
    ("docs/ai-huoke-docs.html",              "docs/index.html"),
    ("docs/geo-guide.html",                  "docs/geo-guide.html"),
    ("docs/geo-p0-report.html",              "docs/GEO伙计特别版P0开发完成报告.html"),
    ("docs/global-p0-report.html",           "docs/出海专版P0开发完成报告.html"),
    ("docs/global-qualification.html",       "docs/出海资质申请指南.html"),
    ("docs/deployment-guide.md",             "docs/deployment-guide.md"),
]

def main():
    # 1) 快照当前首页
    cur_index = os.path.join(ROOT, "index.html")
    if os.path.exists(cur_index):
        ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        snap = os.path.join(ARCH, "usedcar-home-snapshot-%s.html" % ts)
        shutil.copy2(cur_index, snap)
        print("[snapshot] current index.html -> %s" % os.path.basename(snap))

    # 2) 复制归档回原路径
    n = 0
    for arc_rel, orig_rel in MAP:
        src = os.path.join(ARCH, arc_rel.replace("/", os.sep))
        dst = os.path.join(ROOT, orig_rel.replace("/", os.sep))
        if not os.path.exists(src):
            print("[missing] %s" % arc_rel); continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        print("[restore] %s  ->  %s" % (arc_rel, orig_rel))
        n += 1
    print("\nDone. %d files restored to original paths." % n)
    print("注意：本地已复原；如需线上生效，请把这些文件重新部署到 GitHub 仓库。")

if __name__ == "__main__":
    main()
