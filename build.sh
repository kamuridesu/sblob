#! /bin/bash

OUTPUT_FOLDER="build"

echo "Building manifest"
mkdir -p $OUTPUT_FOLDER || exit 1
rm -r "$OUTPUT_FOLDER"/* 2>/dev/null
cp -r styles/ index.html build/
mkdir -p $OUTPUT_FOLDER/posts || exit 1

LIST_CONTENT="<ul>"
pages=$(for page in posts/*.json; do
    sort_key=$(jq -r '.publish_date' "$page" | awk -F'/' '{print $3$1$2}')
    if [ -n "$sort_key" ]; then
        echo "$sort_key $page"
    fi
done | sort -rn | cut -d ' ' -f 2-)

for page in $pages; do
    filename=$(basename "$page")
    echo "Found page: $filename";
    title=$(jq -r '.title' "$page")
    LIST_CONTENT="$LIST_CONTENT<li><a href=\"/posts/${filename%.*}.html\">$title</a></li>"
    pandoc posts/${filename%.*}.md \
        -s --highlight-style=breezedark \
        --template=.pandoc/post.template.html \
        --metadata title="$title" \
        -o $OUTPUT_FOLDER/posts/${filename%.*}.html || exit 1
done

LIST_CONTENT="$LIST_CONTENT</ul>"
sed -i "s|%posts%|$LIST_CONTENT|" $OUTPUT_FOLDER/index.html || exit 1
echo "Done!"

