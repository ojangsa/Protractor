import os

# 파일 경로
base_path = "../"
files = [
    {"name": "index.html", "path": "index.html", "var": "index_html", "type": "text/html"},
    {"name": "styles.css", "path": "styles.css", "var": "styles_css", "type": "text/css"},
    {"name": "app.js", "path": "app.js", "var": "app_js", "type": "application/javascript"}
]

output_path = "web_assets.h"

header_content = """#ifndef WEB_ASSETS_H
#define WEB_ASSETS_H

"""

for file in files:
    full_path = os.path.join(base_path, file["path"])
    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
            # C++ Raw String Literal 사용 (R"rawliteral(...)rawliteral")
            # 내용 중에 )rawliteral" 이 있으면 안되지만 일반적인 코드엔 없음
            header_content += f'const char* {file["var"]} = R"rawliteral(\n{content}\n)rawliteral";\n\n'
    except Exception as e:
        print(f"Error reading {file['name']}: {e}")
        exit(1)

header_content += "#endif\n"

with open(output_path, "w", encoding="utf-8") as f:
    f.write(header_content)

print(f"Successfully generated {output_path}")
