import os
import re

# 파일 경로
base_path = "../"
files = {
    "html": "index.html",
    "css": "styles.css",
    "js": "app.js"
}

output_path = "web_assets.h"

def read_file(filename):
    path = os.path.join(base_path, filename)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        print(f"Error reading {filename}: {e}")
        exit(1)

# 파일 읽기
html_content = read_file(files["html"])
css_content = read_file(files["css"])
js_content = read_file(files["js"])

# CSS 인라인화
# <link rel="stylesheet" href="styles.css"> 찾아서 교체
css_pattern = r'<link[^>]*href=["\']styles\.css["\'][^>]*>'
html_content = re.sub(css_pattern, f'<style>\n{css_content}\n</style>', html_content)

# JS 인라인화
# <script src="app.js"></script> 찾아서 교체
js_pattern = r'<script[^>]*src=["\']app\.js["\'][^>]*>\s*</script>'
# app.js 내용에 $ 같은 특수문자가 있을 수 있으므로 단순 replace가 안전할 수 있음
# 하지만 re.sub을 쓰되 lambda를 쓰면 안전
html_content = re.sub(js_pattern, lambda match: f'<script>\n{js_content}\n</script>', html_content)

# 헤더 파일 생성
header_content = """#ifndef WEB_ASSETS_H
#define WEB_ASSETS_H

// Merged HTML (index.html + styles.css + app.js)
const char* index_html = R"rawliteral(
""" + html_content + """
)rawliteral";

#endif
"""

with open(output_path, "w", encoding="utf-8") as f:
    f.write(header_content)

print(f"Successfully generated {output_path} (Merged Single File)")
