#! /bin/bash

OUTPUT_FOLDER="build"

echo "Building manifest"
rm -r $OUTPUT_FOLDER 2>/dev/null
mkdir -p $OUTPUT_FOLDER || exit 1
cp -r components/ posts/ scripts/ styles/ index.html build/

MANIFEST_FILE="$OUTPUT_FOLDER/scripts/manifest.js";

echo "const postsManifests = [" > $MANIFEST_FILE || exit 1

pages=$(stat -c '%w %n' posts/* | sort -rn | cut -d " " -f 4 | grep json);

for page in $pages; do
    echo "Found page: $page";
    echo "\"$page\"", >> $MANIFEST_FILE || exit 1
done

sed -i '$s/,$//' $MANIFEST_FILE || exit 1

echo "]" >> $MANIFEST_FILE || exit 1
echo "Done!"
