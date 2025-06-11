const converter = new showdown.Converter();

async function buildPostListToIndex() {
  console.log("test");
  if (!postsManifests) {
    console.warn("no posts found");
    return;
  }

  document.getElementsByTagName("title")[0].text = "Kamublob";

  try {
    var postContainer = document.getElementById("postsContainer");

    const items = await Promise.all(
      postsManifests.slice(0, 5).map(async (post) => {
        try {
          const jsonData = await fetch(`/${post}`);
          const data = await jsonData.json();
          return `\t<li><a href=${post.replace(".json", "")}>${data.title}</a></li>\n`;
        } catch (e) {
          console.error("failed to fetch page " + post + " err is: ", e);
          return "";
        }
      }),
    );
    postContainer.innerHTML = `<ul>\n${items.join("")}</ul>`;
  } catch (e) {
    console.error("failed to fetch page contents, err is ", e);
  }
}

async function fetchPost(postPath) {
  const postContainer = document.getElementById("postsContainer");
  const jsonPath = `${postPath}.json`;
  try {
    const response = await fetch(jsonPath);
    if (!response.ok) {
      throw new Error("Post not found");
    }
    const jsonData = await response.json();
    const content = await fetch(jsonData.file);
    if (!response.ok) {
      throw new Error("Post content not found");
    }
    const contentText = await content.text();
    document.getElementsByTagName("title")[0].text = jsonData.title;
    postContainer.innerHTML = converter.makeHtml(contentText);
  } catch (e) {
    console.error("failed to load post for " + postPath + " err is: ", e);
    return;
  }
}

if (window.location.pathname === "/") {
  buildPostListToIndex();
}
