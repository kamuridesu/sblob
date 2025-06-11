#! /bin/bash

OUTPUT_FOLDER="build"
MANIFEST_FILE=

rm -r $OUTPUT_FOLDER || exit 1
mkdir -p $OUTPUT_FOLDER || exit 1
cp -r components/ posts/ scripts/ index.html build/

MANIFEST_FILE="$OUTPUT_FOLDER/scripts/manifest.js";

echo "const postsManifests = [" > $MANIFEST_FILE || exit 1

pages=$(stat -c '%w %n' posts/* | sort -rn | cut -d " " -f 4 | grep json);

for page in $pages; do
    echo $page;
    echo "\"$page\"", >> $MANIFEST_FILE || exit 1
done

sed -i '$s/,$//' $MANIFEST_FILE || exit 1

echo "]" >> $MANIFEST_FILE || exit 1

