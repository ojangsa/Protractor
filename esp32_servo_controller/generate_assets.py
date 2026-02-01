import os
import re
import gzip

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
css_pattern = r'<link[^>]*href=["\']styles\.css["\'][^>]*>'
html_content = re.sub(css_pattern, f'<style>\n{css_content}\n</style>', html_content)

# JS 인라인화
# $ 같은 특수문자 처리를 위해 replace 대신 lambda 사용 권장되나,
# 여기서는 단순 치환을 위해 lambda 사용
js_pattern = r'<script[^>]*src=["\']app\.js["\'][^>]*>\s*</script>'
html_content = re.sub(js_pattern, lambda match: f'<script>\n{js_content}\n</script>', html_content)

# Gzip 압축
compressed_data = gzip.compress(html_content.encode('utf-8'))
data_len = len(compressed_data)

# C 배열 생성
hex_array = ", ".join(f"0x{b:02x}" for b in compressed_data)

# 헤더 파일 생성
header_content = f"""#ifndef WEB_ASSETS_H
#define WEB_ASSETS_H
#include <pgmspace.h>

// Gzipped Merged HTML
const uint32_t index_html_gz_len = {data_len};
const uint8_t index_html_gz[] PROGMEM = {{
{hex_array}
}};

#endif
"""

with open(output_path, "w", encoding="utf-8") as f:
    f.write(header_content)

print(f"Successfully generated {output_path} (Gzipped: {data_len} bytes)")
