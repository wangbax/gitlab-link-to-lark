import { getLarkConfig, getLarkConfigSync } from "./store";
import { checkCondition, LARK_DOMAIN_HOST } from "./utils";
import { MSG_EVENT } from "./event";

main();

async function main() {
  if (!checkCondition()) return;

  // {
  //   [tid]: {
  //     locker: Boolean,
  //     error: Boolean,
  //     data: Object,
  //   }
  // }
  let cacheMap = new Map();
  const POPOVER_STYLE_ID = "lark-popover-link-style";
  let dom_lark_popover = null;

  await getLarkConfig();
  const nodeMap = new Map();

  chrome.runtime.onMessage.addListener(function (e) {
    const { message, data } = e;
    switch (message) {
      case MSG_EVENT.GET_LARK_PROJECT_INFO:
        cacheMap.set(data.tid, {
          locker: true,
          error: data.error,
          data: data.data,
        });

        // 如果返回了实际的类型信息，更新所有该 tid 的链接
        if (data.actualType) {
          updateLinksWithCorrectType(data.tid, data.actualType);
        }
        break;
    }
  });

  // 更新链接为正确的类型
  function updateLinksWithCorrectType(tid, actualType) {
    const LarkConfig = getLarkConfigSync();
    if (!LarkConfig) return;

    const links = document.querySelectorAll(`a[data-tid="${tid}"]`);

    links.forEach(link => {
      const projectId = tid.split("-")[1];
      const url = getLarkProjectLink(projectId, actualType);
      if (link.href !== url) {
        link.href = url;
      }
    });
  }

  initPopover();
  initPageListener();

  // 全局扫描：处理页面上所有现有的 GFM 链接
  function scanAllGfmLinks() {
    const allGfmLinks = document.querySelectorAll('a.gfm.gfm-issue');

    allGfmLinks.forEach(link => {
      if (link.classList.contains('lark-project-link')) {
        return;
      }

      const LarkConfig = getLarkConfigSync();
      if (!LarkConfig) return;

      const prefixes = LarkConfig?.prefixes || "m,f";
      const prefixList = prefixes.split(",").map(p => p.trim().toLowerCase()).filter(p => p);
      const text = link.textContent.trim();
      // 要求数字部分至少7位数
      const match = text.match(new RegExp(`(${prefixList.join("|")})-\\d{7,}`, "i"));

      if (match) {
        const tid = match[0];
        const projectId = tid.split("-")[1];
        const prefix = tid.split("-")[0].toLowerCase();

        let type = "story";
        if (prefix === "m") {
          type = "story";
        } else if (prefix === "f") {
          type = "issue";
        }

        const url = getLarkProjectLink(projectId, type);

        // 这些是独立的 issue 链接，整个链接都应该指向飞书
        link.href = url;
        link.target = "_blank";
        link.classList.add('lark-project-link');
        link.dataset.tid = tid;

        fetchLarkProjectInfo({
          tid: tid,
          app: LarkConfig.app,
        });

        bindPopoverEvent(link);
      }
    });
  }

  // 立即执行一次全局扫描
  scanAllGfmLinks();

  // 页面变化时重新扫描
  const observer = new MutationObserver(() => {
    scanAllGfmLinks();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 初始化 popover 节点
  function initPopover() {
    if (document.getElementById(POPOVER_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = POPOVER_STYLE_ID;
    style.innerHTML = `
    .lark-project-link {
      padding: 0 2px;
      text-decoration: none;
      position: relative;
      transition: all .2s;
    }
    .lark-project-link:hover {
      text-decoration: none;
      background-color: #a1d1fc;
    }
    .lark-popover {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      background-color: #000;
      color: #fff;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .lark-popover-show {
      display: block;
    }
    .lark-popover-hide {
      display: none;
    }
  `;
    document.head.appendChild(style);
    const div = document.createElement("div");
    div.classList.add("lark-popover");
    document.body.appendChild(div);
    dom_lark_popover = div;
  }

  // 初始化页面节点监听
  async function initPageListener() {
    const config = await getLarkConfig();
    if (!config) return;
    const dom_content_wrapper = document.querySelector(".content-wrapper");

    const ro = new ResizeObserver(function () {
      const dom_commits_list = document.getElementById("commits-list");
      if (dom_commits_list) {
        replaceCommitList();
      }

      const dom_tree_holder = document.getElementById("tree-holder");
      if (dom_tree_holder) {
        const dom_project_last_commit = dom_tree_holder.querySelector(
          ".project-last-commit"
        );
        // 使用 firstElementChild 确保获取的是 Element 而不是文本节点
        const targetElement = dom_project_last_commit?.firstElementChild || dom_project_last_commit;
        if (targetElement && targetElement instanceof Element) {
          const ro = new ResizeObserver(replaceTreeHolderProjectLastCommit);
          ro.observe(targetElement);
        }
      }

      const dom_content_body = document.getElementById("content-body");
      if (dom_content_body) {
        const ro = new ResizeObserver(replaceContentBodyCommitList);
        ro.observe(dom_content_body);
      }

      replaceMergeRequestTitle();
    });

    if (dom_content_wrapper) {
      ro.observe(dom_content_wrapper);
    }
  }

  // 鼠标移入事件
  function enterHandler(e) {
    const rect = e.target.getBoundingClientRect();
    dom_lark_popover.classList.remove("lark-popover-hide");
    dom_lark_popover.classList.add("lark-popover-show");
    dom_lark_popover.style.setProperty("top", `${rect.y}px`);
    dom_lark_popover.style.setProperty("left", `${rect.x - 8}px`);
    dom_lark_popover.style.setProperty("transform", `translate(0%, -102%)`);
    const tid = e.target.dataset.tid;
    const cache = cacheMap.get(tid);
    let innerHTML = "飞书链接";
    if (cache) {
      if (cache.data) {
        innerHTML = cache.data.name;
      } else if (cache.error) {
        innerHTML = "未找到相关信息";
      }
    }
    dom_lark_popover.innerHTML = innerHTML;
  }

  // 鼠标移出事件
  function leaveHandler() {
    dom_lark_popover.classList.remove("lark-popover-show");
  }

  // 绑定 popover 事件
  function bindPopoverEvent(dom) {
    dom.addEventListener("mouseenter", enterHandler);
    dom.addEventListener("mouseleave", leaveHandler);
  }

  // 获取 Lark 项目链接
  function getLarkProjectLink(projectId, type = "story") {
    const LarkConfig = getLarkConfigSync();
    if (type === "issue")
      return `${LARK_DOMAIN_HOST}/${LarkConfig.app}/issue/detail/${projectId}`;
    return `${LARK_DOMAIN_HOST}/${LarkConfig.app}/story/detail/${projectId}`;
  }

  function fetchLarkProjectInfo(data) {
    const { app, tid } = data;

    if (cacheMap.has(tid) && cacheMap.get(tid).locker) {
      return;
    }

    cacheMap.set(tid, {
      locker: true,
      error: false,
      data: null,
    });

    chrome.runtime.sendMessage({
      message: MSG_EVENT.GET_LARK_PROJECT_INFO,
      data: {
        app,
        tid,
      },
    });
  }

  // 新方法：处理 GitLab 自动生成的 issue 链接
  function replaceLarkLinks(dom) {
    const LarkConfig = getLarkConfigSync();
    if (!LarkConfig) {
      return false;
    }

    // 获取配置的前缀，默认为 m,f
    const prefixes = LarkConfig?.prefixes || "m,f";
    const prefixList = prefixes.split(",").map(p => p.trim().toLowerCase()).filter(p => p);
    // 要求数字部分至少7位数
    const reg = new RegExp(`^(${prefixList.join("|")})-\\d{7,}$`, "i");


    let hasReplaced = false;
    let issueLinks = [];

    // 只处理 GitLab 自动生成的独立 issue 链接（.gfm.gfm-issue）
    if (dom.tagName === 'A' && (dom.classList.contains('gfm-issue') || dom.classList.contains('gfm'))) {
      issueLinks = [dom];
    } else {
      // 在容器内查找 GitLab 自动生成的 issue 链接
      issueLinks = dom.querySelectorAll('a.gfm.gfm-issue, a.gfm-issue');
    }


    Array.from(issueLinks).forEach(link => {
      const text = link.textContent.trim();

      // 检查链接文本是否包含前缀模式（数字至少7位）
      const match = text.match(new RegExp(`(${prefixList.join("|")})-\\d{7,}`, "i"));

      if (match) {
        const tid = match[0];
        const projectId = tid.split("-")[1];
        const prefix = tid.split("-")[0].toLowerCase();


        // 保持向后兼容：m->story, f->issue
        let type = "story";
        if (prefix === "m") {
          type = "story";
        } else if (prefix === "f") {
          type = "issue";
        }

        // 替换链接的 href 为飞书链接
        const url = getLarkProjectLink(projectId, type);

        const oldHref = link.href;
        link.href = url;
        link.target = "_blank";
        link.classList.add('lark-project-link');
        link.dataset.tid = tid;


        // 获取飞书项目信息
        fetchLarkProjectInfo({
          tid: tid,
          app: LarkConfig.app,
        });

        // 绑定 popover 事件
        bindPopoverEvent(link);
        hasReplaced = true;
      }
    });

    return hasReplaced;
  }

  // 旧方法：替换纯文本中的项目 ID 为 Lark 项目链接（向后兼容）
  function replaceProjectIdToLarkProjectLink(dom, className) {
    const LarkConfig = getLarkConfigSync();
    // 获取配置的前缀，默认为 m,f
    const prefixes = LarkConfig?.prefixes || "m,f";
    const prefixList = prefixes.split(",").map(p => p.trim().toLowerCase()).filter(p => p);
    // 要求数字部分至少7位数，匹配带 # 号的格式
    const reg = new RegExp(`#(${prefixList.join("|")})-\\d{7,}`, "gi");

    let isFind = false;
    const content = dom.innerHTML.replace(reg, ($0, $1) => {
      // $0 是完整匹配（包含 #），$1 是括号中的前缀部分
      const fullMatch = $0; // 如 #TAP-6478178330
      const tid = fullMatch.substring(1); // 移除 # 号，得到 TAP-6478178330
      const projectId = tid.split("-")[1];
      const prefix = tid.split("-")[0].toLowerCase();
      isFind = true;

      // 保持向后兼容：m->story, f->issue
      let type = "story";
      if (prefix === "m") {
        type = "story";
      } else if (prefix === "f") {
        type = "issue";
      }
      // 对于其他前缀，默认使用 story，后端会动态判断

      const url = getLarkProjectLink(projectId, type);
      fetchLarkProjectInfo({
        tid: tid,
        app: LarkConfig.app,
      });
      // 只替换 #TAP-xxx 部分为飞书链接
      return `<a class='lark-project-link ${className ? className : ""
        }' href='${url}' target='_blank' data-tid="${tid}" >${fullMatch}</a>`;
    });
    return [isFind, content];
  }

  // 替换 commit message 中的项目 ID 为 Lark 项目链接
  function replaceCommitList() {
    const dom_commits_rows = document.getElementsByClassName("commits-row");

    Array.from(dom_commits_rows).forEach((item) => {
      const dom_commit_list = item.getElementsByClassName("commit-list")[0];
      const dom_commit_list_item =
        dom_commit_list.getElementsByClassName("commit");
      Array.from(dom_commit_list_item).forEach((row) => {
        if (nodeMap.has(row)) return;

        // 在整个 commit row 中查找链接（而不是只在第一个链接中查找）
        let hasReplaced = replaceLarkLinks(row);

        // 如果没有找到链接，尝试旧方法处理纯文本（向后兼容）
        if (!hasReplaced) {
          const dom_commit_row_message =
            row.getElementsByClassName("commit-row-message")[0];
          if (dom_commit_row_message) {
            const result = replaceProjectIdToLarkProjectLink(
              dom_commit_row_message
            );
            if (result[0]) {
              dom_commit_row_message.innerHTML = result[1];
              const link =
                dom_commit_row_message.querySelector(".lark-project-link");
              bindPopoverEvent(link);
              hasReplaced = true;
            }
          }
        }

        if (hasReplaced) {
          nodeMap.set(row, true);
        }
      });
    });
  }

  // 替换项目 ID 为 Lark 项目链接
  function replaceTreeHolderProjectLastCommit() {
    const dom_tree_holder = document.getElementById("tree-holder");
    if (!dom_tree_holder) return;
    const dom_project_last_commit = dom_tree_holder.querySelector(
      ".project-last-commit"
    );
    if (!dom_project_last_commit) return;
    if (nodeMap.has(dom_project_last_commit)) return;

    // 在整个 project-last-commit 容器中查找链接
    let hasReplaced = replaceLarkLinks(dom_project_last_commit);

    // 如果没有找到链接，尝试旧方法处理纯文本（向后兼容）
    if (!hasReplaced) {
      const dom_commit_row_message = dom_project_last_commit.querySelector(
        ".commit-row-message"
      );
      if (dom_commit_row_message) {
        const result = replaceProjectIdToLarkProjectLink(dom_commit_row_message);
        if (result[0]) {
          dom_commit_row_message.innerHTML = result[1];
          const link = dom_commit_row_message.querySelector(".lark-project-link");
          bindPopoverEvent(link);
          hasReplaced = true;
        }
      }
    }

    if (hasReplaced) {
      nodeMap.set(dom_project_last_commit, true);
    }
  }

  // 替换内容区域的 commit list
  function replaceContentBodyCommitList() {
    // 注意：.merge-request-title-text 在新版 GitLab 中可能不存在
    // 这里保留旧逻辑以兼容旧版本
    const rows = document.getElementsByClassName("merge-request-title-text");
    Array.from(rows).forEach((item) => {
      const dom_a = item.querySelector("a");
      if (nodeMap.has(dom_a)) return;

      // 优先使用新方法处理已存在的链接
      let hasReplaced = replaceLarkLinks(dom_a);

      // 如果没有找到链接，尝试旧方法处理纯文本（向后兼容）
      if (!hasReplaced) {
        const result = replaceProjectIdToLarkProjectLink(dom_a);
        if (result[0]) {
          dom_a.innerHTML = result[1];
          const link = dom_a.querySelector(".lark-project-link");
          bindPopoverEvent(link);
          hasReplaced = true;
        }
      }

      if (hasReplaced) {
        nodeMap.set(dom_a, true);
      }
    });
  }

  // 替换 merge request title
  function replaceMergeRequestTitle() {
    const dom_merge_request_details = document.querySelector(
      ".merge-request-details"
    );
    if (!dom_merge_request_details) return;
    const dom_merge_request_title =
      dom_merge_request_details.querySelector(".title");
    if (!dom_merge_request_title) return;
    if (nodeMap.has(dom_merge_request_title)) return;

    // 在标题容器中查找所有链接
    let hasReplaced = replaceLarkLinks(dom_merge_request_title);

    // 如果没有找到链接，尝试旧方法处理纯文本（向后兼容）
    if (!hasReplaced) {
      const result = replaceProjectIdToLarkProjectLink(dom_merge_request_title);
      if (result[0]) {
        dom_merge_request_title.innerHTML = result[1];
        const link = dom_merge_request_title.querySelector(".lark-project-link");
        bindPopoverEvent(link);
        hasReplaced = true;
      }
    }

    if (hasReplaced) {
      nodeMap.set(dom_merge_request_title, true);
    }
  }
}
