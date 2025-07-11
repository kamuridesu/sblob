# Sblob

Simple blob that converts Markdown into HTML

Using dynamic rendering to load the page, this project uses JavaScript to load the contents and build the page reactively.

# Usage

Add your posts inside the posts folder. You should have two files, a JSON that contains your metadata like title and file and a Markdown file that contains your post.

The JSON file struct should be like the following:

```json
{
  "title": "Title of the post",
  "file": "file.md containing the post contents",
  "published_date": "",
  "tags": ["list", "of", "tags"]
}
```

Then just run the `build.sh` script. It will create a `build` folder with the generated manifests in a `manifest.js` file to tell the loader where to find the metadata files. Their content is ordered by creation date.

# Building

There's a Dockerfile that uses nginx to run the blog. Just run `docker build -t sblob .`.

# Dependencies

This project depends on:

- [highlight.js](https://highlightjs.org/) for syntax highlighting;
- [showdownjs](https://showdownjs.com/) to convert Markdown to HTML;
- [showdown-highlight](https://github.com/Bloggify/showdown-highlight) to support highlight.js on code generated by showdownjs.

# TODO

- [x] Add tag filter
- [ ] Add pagination
