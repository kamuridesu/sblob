#!/bin/bash -eu
DIRECTORY_TO_OBSERVE="$(pwd)"
block_for_change() {
  inotifywait --recursive \
    --event modify,move,create,delete \
    $DIRECTORY_TO_OBSERVE
}
BUILD_SCRIPT=build.sh
build() {
  bash $BUILD_SCRIPT
}
build
while block_for_change; do
  build
done

