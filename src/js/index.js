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

  // 使用 WeakSet 追踪已处理的 DOM 元素（避免重复处理）
  const processedElements = new WeakSet();

  // 记录每个 tid 的实际类型（用于统一同一 tid 的多个链接）
  const tidTypeMap = new Map();

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

    // 更新类型映射
    tidTypeMap.set(tid, actualType);

    const links = document.querySelectorAll(`a[data-tid="${tid}"]`);

    links.forEach(link => {
      const projectId = tid.split("-")[1];
      const url = getLarkProjectLink(projectId, actualType);
      if (link.href !== url) {
        link.href = url;
      }
      // 更新 data-lark-type 属性
      link.dataset.larkType = actualType;
    });
  }

  initPopover();
  initPageListener();
  hideGitLabTooltips();

  // 隐藏 GitLab 的 "Issue in Jira" tooltip
  function hideGitLabTooltips() {
    // 添加 CSS 来隐藏 GitLab 的 tooltip
    const style = document.createElement("style");
    style.id = "hide-gitlab-tooltips";
    style.innerHTML = `
      /* 隐藏飞书链接上的 GitLab tooltip */
      .lark-project-link + [id^="gl-tooltip"],
      [id^="gl-tooltip"]:has(.tooltip-inner span:contains("Issue in Jira")),
      [id^="gl-tooltip"]:has(.tooltip-inner span:contains("issue in jira")) {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    // 使用 MutationObserver 监听 tooltip 的出现
    const tooltipObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 检查是否是 GitLab tooltip
            if (node.id && node.id.startsWith('gl-tooltip')) {
              const tooltipInner = node.querySelector('.tooltip-inner span');
              if (tooltipInner && tooltipInner.textContent === 'Issue in Jira') {
                // 检查关联的元素是否是飞书链接
                const ariaDescribedBy = document.querySelector(`[aria-describedby="${node.id}"]`);
                if (ariaDescribedBy && ariaDescribedBy.classList.contains('lark-project-link')) {
                  node.style.display = 'none';
                }
              }
            }
          }
        });
      });
    });

    tooltipObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 获取链接的上下文文本（用于智能判断类型）
  function getContextText(link) {
    // 方法1：尝试获取链接所在的完整容器文本
    let contextElement = link.parentElement;

    // 向上查找最多 5 层，找到包含完整文本的容器
    for (let i = 0; i < 5 && contextElement; i++) {
      const tagName = contextElement.tagName.toLowerCase();
      // 如果是标题、段落、列表项等，使用该元素的文本
      if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' ||
        tagName === 'p' || tagName === 'li' || tagName === 'td' ||
        contextElement.classList.contains('commit-row-message') ||
        contextElement.classList.contains('commit-content') ||
        contextElement.classList.contains('commit-detail') ||
        contextElement.classList.contains('title')) {
        return contextElement.textContent || '';
      }
      contextElement = contextElement.parentElement;
    }

    // 方法2：如果是 commit 列表，尝试查找同级的 commit-row-message
    const commitContent = link.closest('.commit-content, .commit-detail, .commit');
    if (commitContent) {
      const commitMessage = commitContent.querySelector('.commit-row-message, .commit-row-description');
      if (commitMessage) {
        return commitMessage.textContent + ' ' + link.textContent;
      }
    }

    // 方法3：获取前面的文本节点（处理 #TAP-xxx 这种情况）
    let previousText = '';
    let prevNode = link.previousSibling;
    // 向前查找最多 3 个兄弟节点
    for (let i = 0; i < 3 && prevNode; i++) {
      if (prevNode.nodeType === Node.TEXT_NODE) {
        previousText = prevNode.textContent + previousText;
      } else if (prevNode.nodeType === Node.ELEMENT_NODE) {
        previousText = prevNode.textContent + previousText;
      }
      prevNode = prevNode.previousSibling;
    }

    // 如果找到了前置文本，组合起来
    if (previousText.trim()) {
      return previousText + ' ' + link.textContent;
    }

    // 默认返回父元素或链接自身的文本
    return link.parentElement?.textContent || link.textContent;
  }

  // 全局扫描：处理页面上所有现有的 GFM 链接
  function scanAllGfmLinks() {
    const allGfmLinks = document.querySelectorAll('a.gfm.gfm-issue');

    allGfmLinks.forEach(link => {
      // 检查是否已处理
      const alreadyProcessed = processedElements.has(link) || link.classList.contains('lark-project-link');

      if (alreadyProcessed) {
        // 即使已处理，也要检查类型是否需要更新
        const currentTid = link.dataset.tid;
        const currentType = link.dataset.larkType;
        const correctType = tidTypeMap.get(currentTid);

        if (correctType && currentType !== correctType) {
          // 类型不一致，需要更新
          const projectId = currentTid.split("-")[1];
          const url = getLarkProjectLink(projectId, correctType);
          link.href = url;
          link.dataset.larkType = correctType;
          // 确保在 WeakSet 中
          processedElements.add(link);
        }
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

        // 检查是否已经有这个 tid 的类型记录
        let type = tidTypeMap.get(tid);

        if (!type) {
          // 根据上下文智能判断初始类型
          type = "story";

          if (prefix === "m") {
            type = "story";
          } else if (prefix === "f") {
            type = "issue";
          } else {
            // 检查链接所在的文本上下文，根据 commit 类型前缀判断
            const contextText = getContextText(link);
            const lowerContext = contextText.toLowerCase();

            // fix/bugfix/hotfix 等通常是 issue（修复类）
            if (/\b(fix|bugfix|hotfix|bug)[\s:]/i.test(lowerContext)) {
              type = "issue";
            }
            // feat/feature 通常是 story（新功能）
            else if (/\b(feat|feature)[\s:]/i.test(lowerContext)) {
              type = "story";
            }
            // chore/refactor/perf/style/test/docs 等通常是 story（日常任务）
            else if (/\b(chore|refactor|perf|style|test|docs|build|ci)[\s:]/i.test(lowerContext)) {
              type = "story";
            }
            // 默认保持 story
          }

          // 记录初始类型
          tidTypeMap.set(tid, type);
        }

        const url = getLarkProjectLink(projectId, type);

        // 这些是独立的 issue 链接，整个链接都应该指向飞书
        link.href = url;
        link.target = "_blank";
        link.classList.add('lark-project-link');
        link.dataset.tid = tid;
        link.dataset.larkType = type;

        // 标记为已处理
        processedElements.add(link);

        // 移除 GitLab 的 tooltip 属性
        removeGitLabTooltipAttributes(link);

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

  // 防抖函数
  let scanTimer = null;
  function debouncedScanAllGfmLinks() {
    if (scanTimer) {
      clearTimeout(scanTimer);
    }
    scanTimer = setTimeout(() => {
      scanAllGfmLinks();
    }, 100); // 100ms 防抖
  }

  // 页面变化时重新扫描（使用防抖优化性能）
  const observer = new MutationObserver((mutations) => {
    // 检查是否有新增的节点
    let shouldScan = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }
    if (shouldScan) {
      debouncedScanAllGfmLinks();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 监听 URL 变化（GitLab 使用 History API）
  let lastUrl = location.href;

  const titleObserver = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      // URL 变化时延迟扫描，等待新内容加载
      setTimeout(() => {
        scanAllGfmLinks();
      }, 500);
    }
  });

  const titleElement = document.querySelector('title');
  if (titleElement) {
    titleObserver.observe(titleElement, {
      childList: true,
      subtree: true
    });
  }

  // 监听 popstate 事件（浏览器前进/后退）
  window.addEventListener('popstate', () => {
    setTimeout(() => {
      scanAllGfmLinks();
    }, 500);
  });

  // 监听 GitLab 的 Vue 路由变化
  window.addEventListener('hashchange', () => {
    setTimeout(() => {
      scanAllGfmLinks();
    }, 300);
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
      padding: 6px 8px;
      border-radius: 3px;
      z-index: 9999;
      font-size: 12px;
      line-height: 1.4;
      white-space: nowrap;
    }
    .lark-popover::after {
      content: "";
      position: absolute;
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 6px solid #000;
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
    const tid = e.target.dataset.tid;
    const larkType = e.target.dataset.larkType || "story";
    const cache = cacheMap.get(tid);

    // 根据类型设置默认文本
    let innerHTML = larkType === "issue" ? "Issue in Lark" : "Story in Lark";

    if (cache) {
      if (cache.data) {
        innerHTML = cache.data.name;
      } else if (cache.error) {
        innerHTML = "未找到相关信息";
      }
    }
    dom_lark_popover.innerHTML = innerHTML;

    // 显示 tooltip
    dom_lark_popover.classList.remove("lark-popover-hide");
    dom_lark_popover.classList.add("lark-popover-show");

    // 计算居中位置
    const linkCenterX = rect.x + rect.width / 2;
    const tooltipWidth = dom_lark_popover.offsetWidth;

    // 设置位置：水平居中，垂直在链接上方（增加 8px 间距）
    dom_lark_popover.style.setProperty("top", `${rect.y}px`);
    dom_lark_popover.style.setProperty("left", `${linkCenterX}px`);
    dom_lark_popover.style.setProperty("transform", `translate(-50%, calc(-100% - 8px))`);
  }

  // 鼠标移出事件
  function leaveHandler() {
    dom_lark_popover.classList.remove("lark-popover-show");
  }

  // 移除 GitLab 的 tooltip 属性
  function removeGitLabTooltipAttributes(element) {
    // 移除 GitLab 的 tooltip 相关属性
    element.removeAttribute('aria-describedby');
    element.removeAttribute('data-original-title');
    element.removeAttribute('title');

    // 移除 has-tooltip 类
    element.classList.remove('has-tooltip');
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
        link.dataset.larkType = type;

        // 移除 GitLab 的 tooltip 属性
        removeGitLabTooltipAttributes(link);

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
        }' href='${url}' target='_blank' data-tid="${tid}" data-lark-type="${type}" >${fullMatch}</a>`;
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
