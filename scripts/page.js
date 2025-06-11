async function includeFooterAndHeader() {
  var headerSection = document.getElementById("headerSection");
  var footerSection = document.getElementById("footerSection");

  try {
    var footerContent = await fetch("components/footer.html");
    footerSection.innerHTML = await footerContent.text();

    var headerContent = await fetch("components/header.html");
    headerSection.innerHTML = await headerContent.text();
  } catch (e) {
    console.error("could not fetch resources, err is ", e);
  }
}

async function router() {
  console.log("routing ");
  const path = window.location.pathname;
  const postContainer = document.getElementById("postsContainer");
  postContainer.innerHTML = "<p>Loading...</p>";
  if (path === "/" || path === "/index.html") {
    await buildPostListToIndex();
  } else {
    await fetchPost(path);
  }
}

function setupEventListener() {
  console.log("event listener set");
  document.addEventListener("click", (e) => {
    const target = e.target.closest("a");
    if (!target || !target.hasAttribute("href")) {
      return;
    }
    const targetUrl = new URL(target.href);
    const currentUrl = new URL(window.location.href);
    if (targetUrl.origin !== currentUrl.origin) {
      return;
    }

    if (e.button != 0 || e.ctrlKey || e.metaKey || e.shiftKey) {
      return;
    }
    e.preventDefault();
    if (targetUrl.href == currentUrl.href) {
      return;
    }

    window.history.pushState(
      {
        path: targetUrl.pathname,
      },
      "",
      targetUrl.pathname,
    );
    router();
  });

  window.addEventListener("popstate", () => {
    router();
  });
}

function main() {
  includeFooterAndHeader();
  setupEventListener();
}
main();
