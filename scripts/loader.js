const converter = new showdown.Converter({
  extensions: [
    showdownHighlight({
      pre: true,
      auto_detection: true,
    }),
  ],
});

const CACHED_POSTS_LIST = {};

async function fetchCacheable(url) {
  try {
    if (CACHED_POSTS_LIST[url] != undefined) {
      return CACHED_POSTS_LIST[url];
    }
    const request = await fetch(url);
    const data = await request.json();
    CACHED_POSTS_LIST[url] = data;
    return data;
  } catch (e) {
    console.error(`error fetching url ${url}, err is `, e);
    return undefined;
  }
}

async function buildPostListToIndex() {
  if (!postsManifests) {
    console.error("no posts found");
    return;
  }

  document.getElementsByTagName("title")[0].text = "Kamublob";

  try {
    var postContainer = document.getElementById("postsContainer");

    const items = await Promise.all(
      postsManifests.slice(0, 5).map(async (post) => {
        const data = await fetchCacheable(`/${post}`);
        if (data == undefined) {
          return "";
        }
        return `\t<li><a href=/${post.replace(".json", "")}>${data.title}</a></li>\n`;
      }),
    );
    postContainer.innerHTML = `<h3>Latest Posts:</h3>\n<ul>\n${items.join("")}</ul>`;
  } catch (e) {
    console.error("failed to fetch page contents, err is ", e);
  }
}

function putMetadata(jsonData, content) {
  const tags = (jsonData.tags == undefined ? [] : jsonData.tags)
    .map((tag) => `<a href=/tag/${tag} >${tag}</a>`)
    .join(" ");
  return `<p>Published at ${jsonData.publish_date}<p>Tags: ${tags}</p></p>\n${content}`;
}

async function fetchPost(postPath) {
  const postContainer = document.getElementById("postsContainer");
  const jsonPath = `${postPath}.json`;
  try {
    const jsonData = await fetchCacheable(jsonPath);
    if (jsonData == undefined) {
      throw new Error("Error fetching metadata");
    }
    const response = await fetch(jsonData.file);
    if (!response.ok) {
      throw new Error("Post content not found");
    }

    const contentText = await response.text();
    document.getElementsByTagName("title")[0].text = jsonData.title;
    postContainer.innerHTML = putMetadata(
      jsonData,
      converter.makeHtml(contentText),
    );
  } catch (e) {
    console.error("failed to load post for " + postPath + " err is: ", e);
    postContainer.innerHTML = `<h3>Post ${postPath} not found!</h3>`;
    return;
  }
}

async function buildTagsPostsList(tag) {
  const postContainer = document.getElementById("postsContainer");
  if (tag === undefined) {
    console.error("tag is undefined");
    postContainer.innerHTML = "<p>Tag not found</p>";
    return;
  }

  if (!postsManifests) {
    console.error("No posts found");
    return;
  }

  document.getElementsByTagName("title")[0].text = "Posts with tag " + tag;

  const items = await Promise.all(
    postsManifests.map(async (post) => {
      const data = await fetchCacheable(`/${post}`);
      if (data == undefined) {
        console.error("erro fetching post data");
        return "";
      }
      if (data.tags.includes(tag)) {
        return `\t<li><a href=/${post.replace(".json", "")}>${data.title}</a></li>\n`;
      }
      return "";
    }),
  );
  postContainer.innerHTML = `<h3>Posts tagged with "${tag}":</h3>\n<ul>\n${items.join("")}</ul>`;
}
