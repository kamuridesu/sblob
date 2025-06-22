#! /bin/bash

OUTPUT_FOLDER="build"

echo "Building manifest"
mkdir -p $OUTPUT_FOLDER || exit 1
rm -r "$OUTPUT_FOLDER"/* 2>/dev/null
cp -r components/ posts/ scripts/ styles/ index.html build/

MANIFEST_FILE="$OUTPUT_FOLDER/scripts/manifest.js";

echo "const postsManifests = [" > $MANIFEST_FILE || exit 1

pages=$(for page in posts/*.json; do
    sort_key=$(jq -r '.publish_date' "$page" | awk -F'/' '{print $3$1$2}')
    if [ -n "$sort_key" ]; then
        echo "$sort_key $page"
    fi
done | sort -rn | cut -d ' ' -f 2-)

for page in $pages; do
    filename=$(basename "$page")
    echo "Found page: $filename";
    echo "  \"posts/$filename\"," >> $MANIFEST_FILE || exit 1
done

if [ -s $MANIFEST_FILE ]; then
    sed -i '$s/,$//' $MANIFEST_FILE || exit 1
fi

echo "]" >> $MANIFEST_FILE || exit 1
echo "Done!"
