window.__ModuleLoader__.load({
  id: '@dsh-custom/dsh-file-manager',
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require('react');
    const h = React.createElement;
    const { useState, useRef, useEffect, useCallback, useMemo } = React;

    const DEF_ID = '@dsh-custom/dsh-file-manager';
    const KIND = 'file-manager';
    const NS = 'fileManager';
    const STYLE_ID = 'dsh-file-manager-style';
    const ROUTE_OP = '/api/dsh-file-manager/op';
    const ROUTE_UPLOAD = '/api/dsh-file-manager/upload';
    const ROUTE_DOWNLOAD = '/api/dsh-file-manager/download';
    const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024;
    const MAX_UPLOAD_FILES = 200;
    const MAX_UPLOAD_TOTAL_BYTES = 8 * 1024 * 1024 * 1024;
    const LIST_PAGE_SIZE = 500;
    const MAX_SELECTION = 2000;
    const EMPTY_ENTRIES = Object.freeze([]);

    const CSS = `
.dfm-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  container-type: inline-size;
  color: var(--dsw-alias-label-primary, #1f2329);
  font-size: 13px;
  line-height: 1.45;
}
.dfm-shell *, .dfm-shell *::before, .dfm-shell *::after { box-sizing: border-box; }
.dfm-header { flex: none; padding: 8px 8px 6px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08)); }
.dfm-toolbar { display: flex; align-items: center; gap: 2px; min-width: 0; }
.dfm-crumbs { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 1px; overflow-x: auto; scrollbar-width: none; white-space: nowrap; }
.dfm-crumbs::-webkit-scrollbar { display: none; }
.dfm-crumb { flex: 0 1 auto; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #5c6470); font: inherit; font-size: 12px; padding: 3px 4px; border-radius: 5px; cursor: pointer; }
.dfm-crumb:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); color: var(--dsw-alias-label-primary, #1f2329); }
.dfm-crumb.is-current { color: var(--dsw-alias-label-primary, #1f2329); font-weight: 600; }
.dfm-crumbSep { flex: none; color: var(--dsw-alias-label-tertiary, #8a919e); font-size: 11px; }
.dfm-tools { flex: none; display: flex; align-items: center; gap: 1px; }
.dfm-iconButton { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary, #5c6470); cursor: pointer; }
.dfm-iconButton:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06)); color: var(--dsw-alias-label-primary, #1f2329); }
.dfm-iconButton:disabled { opacity: .4; cursor: default; background: transparent; }
.dfm-iconButton svg { display: block; }
.dfm-workspace { display: flex; align-items: center; gap: 4px; min-width: 0; margin-top: 3px; padding: 0 2px; color: var(--dsw-alias-label-tertiary, #8a919e); font-size: 11px; }
.dfm-workspace svg { flex: none; opacity: .8; }
.dfm-workspaceText { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfm-selectRow { flex: none; display: flex; align-items: center; gap: 7px; padding: 7px 10px 5px; }
.dfm-checkbox { flex: none; width: 14px; height: 14px; margin: 0; accent-color: var(--dsw-alias-button-primary-fill, #4d6bfe); cursor: pointer; }
.dfm-checkbox:disabled { opacity: .4; cursor: default; }
.dfm-search { position: relative; flex: 1 1 auto; min-width: 0; display: flex; align-items: center; }
.dfm-search svg { position: absolute; left: 7px; color: var(--dsw-alias-label-tertiary, #8a919e); pointer-events: none; }
.dfm-searchInput { width: 100%; height: 26px; padding: 0 22px 0 24px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.1)); border-radius: 6px; background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #1f2329); font: inherit; font-size: 12px; outline: none; }
.dfm-searchInput::placeholder { color: var(--dsw-alias-label-tertiary, #8a919e); }
.dfm-searchInput:focus { border-color: var(--dsw-alias-state-business-primary, #4d6bfe); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary, #4d6bfe) 18%, transparent); }
.dfm-searchClear { position: absolute; right: 3px; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-tertiary, #8a919e); cursor: pointer; }
.dfm-searchClear:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06)); }
.dfm-selection { flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 3px; margin: 0 10px 6px; padding: 5px 7px; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1)); border-radius: 7px; background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.025)); }
.dfm-selectionCount { width: 100%; color: var(--dsw-alias-label-secondary, #5c6470); font-size: 11px; }
.dfm-inlineButton { display: inline-flex; align-items: center; gap: 3px; padding: 3px 6px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: var(--dsw-alias-label-secondary, #5c6470); font: inherit; font-size: 11px; line-height: 1.25; cursor: pointer; text-decoration: none; }
.dfm-inlineButton:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06)); color: var(--dsw-alias-label-primary, #1f2329); }
.dfm-inlineButton.danger { color: var(--dsw-alias-state-error-primary, #d64545); }
.dfm-inlineButton.danger:hover { background: var(--dsw-alias-state-error-secondary, rgba(214,69,69,.1)); }
.dfm-inlineButton:disabled { opacity: .4; cursor: default; background: transparent; }
.dfm-inlineButton svg { display: block; }
.dfm-banner { flex: none; display: flex; align-items: flex-start; gap: 7px; margin: 0 10px 7px; padding: 7px 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.1)); border-radius: 7px; background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.025)); font-size: 12px; }
.dfm-banner.is-error { border-color: var(--dsw-alias-state-error-primary, #d64545); }
.dfm-banner.is-notice { border-color: var(--dsw-alias-state-success-primary, #2f9e6b); }
.dfm-bannerText { flex: 1 1 auto; min-width: 0; word-break: break-word; }
.dfm-bannerClose { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; margin: -2px -2px 0 0; padding: 0; border: 0; border-radius: 4px; background: transparent; color: var(--dsw-alias-label-tertiary, #8a919e); cursor: pointer; }
.dfm-bannerClose:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06)); }
.dfm-list { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 5px 8px; overscroll-behavior: contain; }
.dfm-loadingLine { height: 2px; margin: 0 10px 4px; overflow: hidden; border-radius: 1px; background: var(--dsw-alias-border-l1, rgba(0,0,0,.08)); }
.dfm-loadingLine::after { content: ''; display: block; width: 40%; height: 100%; background: var(--dsw-alias-state-business-primary, #4d6bfe); animation: dfm-slide 1.1s ease-in-out infinite; }
.dfm-listMore { display: flex; justify-content: center; padding: 7px 0 3px; }
.dfm-listMore .dfm-inlineButton { border-color: var(--dsw-alias-border-l2, rgba(0,0,0,.12)); padding: 4px 10px; }
@keyframes dfm-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
.dfm-row { display: grid; grid-template-columns: 18px 18px minmax(0, 1fr) auto 24px; align-items: center; gap: 5px; min-height: 31px; padding: 3px 4px; border-radius: 6px; }
.dfm-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dfm-row.is-selected { background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.055)); }
.dfm-rowCheck { width: 14px; height: 14px; margin: 0; accent-color: var(--dsw-alias-button-primary-fill, #4d6bfe); cursor: pointer; }
.dfm-rowIcon { display: inline-flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-tertiary, #8a919e); }
.dfm-rowIcon.is-dir { color: var(--dsw-alias-state-business-primary, #4d6bfe); }
.dfm-rowIcon.is-link { color: var(--dsw-alias-state-warn-primary, #b7791f); }
.dfm-rowName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 1px 0; border: 0; background: transparent; color: inherit; font: inherit; font-size: 12px; text-align: left; cursor: pointer; border-radius: 3px; }
.dfm-rowName:hover { color: var(--dsw-alias-state-business-primary, #4d6bfe); }
.dfm-meta { flex: none; color: var(--dsw-alias-label-tertiary, #8a919e); font-size: 10px; white-space: nowrap; padding-left: 2px; }
.dfm-moreButton { width: 22px; height: 22px; }
.dfm-inlineActions { grid-column: 1 / -1; display: flex; align-items: center; flex-wrap: wrap; gap: 1px; margin: 2px 0 1px 23px; padding-top: 3px; border-top: 1px dashed var(--dsw-alias-border-l1, rgba(0,0,0,.1)); }
.dfm-empty { padding: 26px 16px; text-align: center; color: var(--dsw-alias-label-tertiary, #8a919e); font-size: 12px; }
.dfm-empty p { margin: 0 0 5px; }
.dfm-empty p:last-child { margin-bottom: 0; }
.dfm-hint { color: var(--dsw-alias-label-tertiary, #8a919e); font-size: 11px; line-height: 1.55; }
.dfm-panel { flex: none; max-height: 34%; overflow: auto; padding: 7px 10px 8px; border-top: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08)); background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.018)); }
.dfm-panelHeader { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; color: var(--dsw-alias-label-secondary, #5c6470); font-size: 11px; }
.dfm-uploadRow { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 2px 8px; margin-bottom: 5px; }
.dfm-uploadName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary, #1f2329); font-size: 11px; }
.dfm-uploadStatus { color: var(--dsw-alias-label-tertiary, #8a919e); font-size: 10px; white-space: nowrap; }
.dfm-uploadStatus.is-error { color: var(--dsw-alias-state-error-primary, #d64545); }
.dfm-progress { grid-column: 1 / -1; height: 3px; overflow: hidden; border-radius: 2px; background: var(--dsw-alias-border-l1, rgba(0,0,0,.08)); }
.dfm-progress > span { display: block; height: 100%; width: 0; border-radius: 2px; background: var(--dsw-alias-button-primary-fill, #4d6bfe); transition: width .15s ease; }
.dfm-dropHint { position: absolute; inset: 6px; z-index: 20; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border: 1.5px dashed var(--dsw-alias-state-business-primary, #4d6bfe); border-radius: 9px; background: color-mix(in srgb, var(--dsw-alias-bg-base, #fff) 88%, transparent); color: var(--dsw-alias-state-business-primary, #4d6bfe); font-size: 12px; pointer-events: none; }
.dfm-overlay { position: absolute; inset: 0; z-index: 30; display: flex; align-items: flex-end; justify-content: center; padding: 7px; background: var(--dsw-alias-bg-mask-1, rgba(0,0,0,.28)); }
.dfm-sheet { display: flex; flex-direction: column; width: 100%; max-height: 86%; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.12)); border-radius: 11px; background: var(--dsw-alias-bg-overlay, #fff); box-shadow: var(--dsw-elevation-panel, 0 10px 30px rgba(0,0,0,.18)); }
.dfm-sheetHeader { flex: none; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 10px 10px 2px 12px; }
.dfm-sheetTitle { margin: 0; color: var(--dsw-alias-label-primary, #1f2329); font-size: 13px; font-weight: 600; line-height: 1.4; }
.dfm-sheetBody { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 7px 12px 12px; }
.dfm-sheetFooter { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 7px; padding-top: 11px; }
.dfm-btn { display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 28px; padding: 0 11px; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.14)); border-radius: 6px; background: transparent; color: var(--dsw-alias-label-primary, #1f2329); font: inherit; font-size: 12px; cursor: pointer; }
.dfm-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dfm-btn:disabled { opacity: .5; cursor: default; }
.dfm-btn.primary { border-color: transparent; background: var(--dsw-alias-button-primary-fill, #4d6bfe); color: var(--dsw-alias-label-primary-foreground, #fff); }
.dfm-btn.primary:hover { background: var(--dsw-alias-button-primary-hover, #3d57d6); }
.dfm-btn.danger { border-color: var(--dsw-alias-state-error-primary, #d64545); color: var(--dsw-alias-state-error-primary, #d64545); }
.dfm-btn.danger:hover { background: var(--dsw-alias-state-error-secondary, rgba(214,69,69,.1)); }
.dfm-btn.dangerSolid { border-color: transparent; background: var(--dsw-alias-state-error-primary, #d64545); color: #fff; }
.dfm-btn.dangerSolid:hover { background: var(--dsw-alias-state-error-primary, #d64545); filter: brightness(.95); }
.dfm-form { display: flex; flex-direction: column; gap: 8px; }
.dfm-label { display: block; margin-bottom: 4px; color: var(--dsw-alias-label-secondary, #5c6470); font-size: 11px; }
.dfm-input { width: 100%; height: 29px; padding: 0 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.14)); border-radius: 6px; background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #1f2329); font: inherit; font-size: 12px; outline: none; }
.dfm-input:focus { border-color: var(--dsw-alias-state-business-primary, #4d6bfe); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary, #4d6bfe) 18%, transparent); }
.dfm-errorText { margin: 0; color: var(--dsw-alias-state-error-primary, #d64545); font-size: 11px; line-height: 1.5; }
.dfm-bodyText { margin: 0 0 8px; color: var(--dsw-alias-label-secondary, #5c6470); font-size: 12px; line-height: 1.55; word-break: break-word; }
.dfm-nameList { margin: 0 0 8px; padding: 0; list-style: none; max-height: 24vh; overflow: auto; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08)); border-radius: 6px; }
.dfm-nameList li { padding: 5px 7px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.06)); color: var(--dsw-alias-label-primary, #1f2329); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfm-nameList li:last-child { border-bottom: 0; }
.dfm-nameList li.is-more { color: var(--dsw-alias-label-tertiary, #8a919e); }
.dfm-dirPath { margin: 0 0 6px; padding: 4px 7px; border-radius: 5px; background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.03)); color: var(--dsw-alias-label-secondary, #5c6470); font-size: 11px; word-break: break-all; }
.dfm-dirList { max-height: 26vh; overflow: auto; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08)); border-radius: 6px; padding: 3px; }
.dfm-dirRow { display: flex; align-items: center; gap: 6px; width: 100%; padding: 5px 6px; border: 0; border-radius: 5px; background: transparent; color: var(--dsw-alias-label-primary, #1f2329); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.dfm-dirRow:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)); }
.dfm-dirRow svg { flex: none; color: var(--dsw-alias-state-business-primary, #4d6bfe); }
.dfm-dirRowName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfm-dirMore { color: var(--dsw-alias-label-tertiary, #8a919e); font-size: 11px; padding: 4px 7px; }
.dfm-preview { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.dfm-previewImg { display: block; max-width: 100%; max-height: 40vh; object-fit: contain; border-radius: 6px; background: var(--dsw-alias-bg-layer-1, rgba(0,0,0,.03)); }
.dfm-pre { width: 100%; max-height: 40vh; margin: 0; overflow: auto; padding: 8px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08)); border-radius: 6px; background: var(--dsw-alias-bg-base, #fff); color: var(--dsw-alias-label-primary, #1f2329); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
.dfm-metaLine { color: var(--dsw-alias-label-tertiary, #8a919e); font-size: 10px; word-break: break-all; }
.dfm-title { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
.dfm-titleText { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dfm-filesAction { width: 24px; height: 24px; }
.dfm-hiddenInput { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; }
.dfm-shell button:focus-visible, .dfm-shell a:focus-visible, .dfm-shell input:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, #4d6bfe); outline-offset: 1px; }
@container (max-width: 300px) {
  .dfm-meta { display: none; }
  .dfm-crumb { max-width: 82px; }
  .dfm-workspace { font-size: 10px; }
}
`;

    const zh = {
      'tab.title': '工作区文件',
      'guide.title': '工作区文件管理',
      'guide.description': '管理当前会话工作区的文件：上传、重命名、移动、复制和删除。',
      'files.action.open': '打开工作区文件管理',
      'header.root': '根目录',
      'header.up': '上一级',
      'header.refresh': '刷新',
      'header.newFolder': '新建文件夹',
      'header.upload': '上传文件',
      'header.selectAll': '全选',
      'header.selectNone': '取消全选',
      'search.placeholder': '搜索当前目录',
      'search.clear': '清除搜索',
      'selection.count': '已选择 {count} 项',
      'selection.rename': '重命名',
      'selection.move': '移动',
      'selection.copy': '复制',
      'selection.delete': '删除',
      'selection.clear': '取消选择',
      'selection.tooMany': '一次最多选择 {count} 项。',
      'list.empty': '此文件夹为空',
      'list.emptyHint': '拖入文件，或点击右上角上传按钮。',
      'list.noMatch': '没有匹配的文件',
      'list.truncated': '还有更多文件，可继续加载。',
      'list.more': '还有 {count} 项',
      'list.loadMore': '加载更多',
      'list.scanTruncated': '目录条目过多，仅扫描前 {count} 项；请输入搜索词缩小范围。',
      'list.skipped': '{count} 项因权限或状态变化未能显示。',
      'list.loading': '正在读取…',
      'list.retry': '重试',
      'list.root': '根目录',
      'row.menu': '更多操作',
      'row.open': '打开',
      'row.preview': '预览',
      'row.download': '下载',
      'row.rename': '重命名',
      'row.copy': '复制',
      'row.move': '移动',
      'row.delete': '删除',
      'row.folder': '文件夹',
      'row.symlink': '链接',
      'row.other': '其他',
      'row.unavailable': '该链接或特殊文件不能预览。',
      'row.selected': '已选择',
      'upload.title': '上传',
      'upload.hint': '支持一次选择多个文件；文件夹请先打包。单个文件最大 8 GiB，单次最多 200 个文件、总计 8 GiB。',
      'upload.button': '选择文件',
      'upload.tooMany': '一次最多上传 200 个文件。',
      'upload.totalTooLarge': '本次选择的文件总计超过 8 GiB。',
      'upload.drop': '松开以上传文件',
      'upload.folderUnsupported': '暂不支持拖入文件夹，请选择文件或先打包。',
      'upload.progress': '{name}：{percent}%',
      'upload.cancel': '取消上传',
      'upload.clear': '清除记录',
      'upload.done': '完成',
      'upload.error': '失败',
      'upload.tooLarge': '超过 8 GiB',
      'upload.queued': '等待中',
      'upload.cancelled': '已取消',
      'upload.aborted': '已取消',
      'upload.uploading': '上传中',
      'noWorkspace': '请在会话中打开工作区文件管理。',
      'noWorkspaceHint': '文件管理会跟随当前会话的工作区目录。',
      'notice.mkdir': '已新建文件夹',
      'notice.rename': '已重命名',
      'notice.delete': '已删除 {count} 项',
      'notice.move': '已移动 {count} 项',
      'notice.copy': '已复制 {count} 项',
      'notice.partial': '{failed} 项未完成，请查看提示后重试。',
      'notice.uploaded': '已上传',
      'notice.uploadedMany': '已上传 {count} 个文件',
      'notice.selected': '已选择 {count} 项',
      'mkdir.title': '新建文件夹',
      'mkdir.placeholder': '文件夹名称',
      'rename.title': '重命名',
      'rename.placeholder': '新名称',
      'delete.title': '确认删除',
      'delete.body': '将删除 {count} 项。',
      'delete.bodyFolder': '其中包含文件夹，文件夹内的全部内容也会被删除。',
      'delete.confirm': '删除',
      'delete.more': '还有 {count} 项…',
      'move.title': '移动到',
      'move.body': '选择目标文件夹，移动后原位置的文件将不再保留。',
      'copy.title': '复制到',
      'copy.body': '选择目标文件夹，复制会保留原文件。',
      'picker.up': '上一级',
      'picker.here': '选择此文件夹',
      'picker.empty': '没有子文件夹',
      'picker.loading': '正在读取…',
      'picker.invalid': '不能移动到所选文件夹自身或其子文件夹内。',
      'preview.title': '预览',
      'preview.loading': '正在读取…',
      'preview.binary': '这是二进制文件，无法以文本预览。',
      'preview.truncated': '文件较大，仅显示前 256 KiB。',
      'preview.download': '下载文件',
      'preview.tooLarge': '图片较大，已停止内嵌预览。',
      'preview.noPreview': '此类型没有内嵌预览。',
      'preview.imageAlt': '{name} 的预览',
      'common.cancel': '取消',
      'common.create': '创建',
      'common.save': '保存',
      'common.close': '关闭',
      'common.working': '处理中…',
      'common.retry': '重试',
      'common.name': '名称',
      'error.network': '无法连接文件服务，请刷新页面后重试。',
      'error.aborted': '操作已取消。',
      'error.busy': '此工作区仍有文件操作在进行，请稍后再试。',
      'error.internal': '操作失败，请重试。',
      'error.invalid-session': '会话已失效，请重新打开会话。',
      'error.session-not-found': '找不到当前会话。',
      'error.no-workspace': '当前会话没有工作区目录。',
      'error.root-unavailable': '工作区目录不存在或不可访问。',
      'error.invalid-path': '路径无效或超出工作区范围。',
      'error.invalid-name': '名称无效，请勿包含 / 或 ..，也不要使用系统保留名称。',
      'error.invalid-body': '请求内容无效。',
      'error.unsupported-action': '不支持的操作。',
      'error.not-found': '文件或文件夹已不存在。',
      'error.exists': '同名文件或文件夹已存在。',
      'error.not-directory': '目标不是文件夹。',
      'error.is-directory': '目标是文件夹，不能这样操作。',
      'error.permission-denied': '没有权限访问该文件或文件夹。',
      'error.too-large': '文件或请求过大。',
      'error.no-space': '磁盘空间不足。',
      'error.cross-device': '无法跨磁盘移动，请先复制再删除。',
      'error.not-text': '这不是可预览的文本文件。',
      'error.unsupported': '不支持该操作。',
      'error.bad-method': '请求方法不受支持。',
      'error.unsupported-media-type': '请求格式不受支持。',
      'error.forbidden': '请求被拒绝。',
      'error.request-too-large': '请求内容过大。',
    };

    const en = {
      'tab.title': 'Workspace Files',
      'guide.title': 'Workspace File Manager',
      'guide.description': "Manage this session's workspace files: upload, rename, move, copy, and delete.",
      'files.action.open': 'Open workspace file manager',
      'header.root': 'Root',
      'header.up': 'Up one level',
      'header.refresh': 'Refresh',
      'header.newFolder': 'New folder',
      'header.upload': 'Upload files',
      'header.selectAll': 'Select all',
      'header.selectNone': 'Clear selection',
      'search.placeholder': 'Search this folder',
      'search.clear': 'Clear search',
      'selection.count': '{count} selected',
      'selection.rename': 'Rename',
      'selection.move': 'Move',
      'selection.copy': 'Copy',
      'selection.delete': 'Delete',
      'selection.clear': 'Clear selection',
      'selection.tooMany': 'Select at most {count} items at a time.',
      'list.empty': 'This folder is empty',
      'list.emptyHint': 'Drop files here, or use the upload button above.',
      'list.noMatch': 'No matching files',
      'list.truncated': 'There are more files to load.',
      'list.more': '{count} more',
      'list.loadMore': 'Load more',
      'list.scanTruncated': 'This folder has too many entries; only the first {count} were scanned. Use search to narrow it down.',
      'list.skipped': '{count} items could not be shown because they changed or were not readable.',
      'list.loading': 'Loading…',
      'list.retry': 'Retry',
      'list.root': 'Root',
      'row.menu': 'More actions',
      'row.open': 'Open',
      'row.preview': 'Preview',
      'row.download': 'Download',
      'row.rename': 'Rename',
      'row.copy': 'Copy',
      'row.move': 'Move',
      'row.delete': 'Delete',
      'row.folder': 'Folder',
      'row.symlink': 'Link',
      'row.other': 'Other',
      'row.unavailable': 'Links and special files cannot be previewed.',
      'row.selected': 'Selected',
      'upload.title': 'Uploads',
      'upload.hint': 'You can select multiple files; archive folders first. Up to 8 GiB per file, 200 files and 8 GiB per batch.',
      'upload.button': 'Choose files',
      'upload.tooMany': 'You can upload at most 200 files at once.',
      'upload.totalTooLarge': 'The selected files total more than 8 GiB.',
      'upload.drop': 'Drop to upload',
      'upload.folderUnsupported': 'Dropping folders is not supported; choose files or archive the folder first.',
      'upload.progress': '{name}: {percent}%',
      'upload.cancel': 'Cancel upload',
      'upload.clear': 'Clear',
      'upload.done': 'Done',
      'upload.error': 'Failed',
      'upload.tooLarge': 'Exceeds 8 GiB',
      'upload.queued': 'Queued',
      'upload.cancelled': 'Cancelled',
      'upload.aborted': 'Cancelled',
      'upload.uploading': 'Uploading',
      'noWorkspace': 'Open workspace files from a session.',
      'noWorkspaceHint': 'The manager follows the current session workspace.',
      'notice.mkdir': 'Folder created',
      'notice.rename': 'Renamed',
      'notice.delete': 'Deleted {count}',
      'notice.move': 'Moved {count}',
      'notice.copy': 'Copied {count}',
      'notice.partial': '{failed} item(s) were not completed. Check the message and try again.',
      'notice.uploaded': 'Uploaded',
      'notice.uploadedMany': 'Uploaded {count} files',
      'notice.selected': '{count} selected',
      'mkdir.title': 'New folder',
      'mkdir.placeholder': 'Folder name',
      'rename.title': 'Rename',
      'rename.placeholder': 'New name',
      'delete.title': 'Confirm delete',
      'delete.body': 'This will delete {count} item(s).',
      'delete.bodyFolder': 'This includes folders; everything inside them will be deleted too.',
      'delete.confirm': 'Delete',
      'delete.more': 'and {count} more…',
      'move.title': 'Move to',
      'move.body': 'Choose a destination folder. The originals will no longer remain in place.',
      'copy.title': 'Copy to',
      'copy.body': 'Choose a destination folder. The originals stay in place.',
      'picker.up': 'Up',
      'picker.here': 'Choose this folder',
      'picker.empty': 'No subfolders',
      'picker.loading': 'Loading…',
      'picker.invalid': 'A folder cannot be moved or copied into itself or its subfolder.',
      'preview.title': 'Preview',
      'preview.loading': 'Loading…',
      'preview.binary': 'This is a binary file and cannot be shown as text.',
      'preview.truncated': 'Large file; showing the first 256 KiB.',
      'preview.download': 'Download file',
      'preview.tooLarge': 'The image is too large for inline preview.',
      'preview.noPreview': 'No inline preview for this type.',
      'preview.imageAlt': 'Preview of {name}',
      'common.cancel': 'Cancel',
      'common.create': 'Create',
      'common.save': 'Save',
      'common.close': 'Close',
      'common.working': 'Working…',
      'common.retry': 'Retry',
      'common.name': 'Name',
      'error.network': 'The file service could not be reached. Refresh the page and try again.',
      'error.aborted': 'The operation was cancelled.',
      'error.busy': 'Another file operation is still running in this workspace. Try again shortly.',
      'error.internal': 'The operation failed. Try again.',
      'error.invalid-session': 'The session is no longer valid. Reopen the session.',
      'error.session-not-found': 'The current session was not found.',
      'error.no-workspace': 'This session has no workspace folder.',
      'error.root-unavailable': 'The workspace folder does not exist or is not accessible.',
      'error.invalid-path': 'The path is invalid or leaves the workspace.',
      'error.invalid-name': 'Invalid name. Avoid / and .., and do not use reserved system names.',
      'error.invalid-body': 'The request was not valid.',
      'error.unsupported-action': 'Unsupported action.',
      'error.not-found': 'The file or folder no longer exists.',
      'error.exists': 'An item with that name already exists.',
      'error.not-directory': 'The destination is not a folder.',
      'error.is-directory': 'The target is a folder and cannot be used this way.',
      'error.permission-denied': 'Permission was denied for that file or folder.',
      'error.too-large': 'The file or request is too large.',
      'error.no-space': 'There is not enough disk space.',
      'error.cross-device': 'That move crosses filesystems; copy first, then delete.',
      'error.not-text': 'This is not previewable text.',
      'error.unsupported': 'That operation is not supported.',
      'error.bad-method': 'That request method is not supported.',
      'error.unsupported-media-type': 'That request format is not supported.',
      'error.forbidden': 'The request was rejected.',
      'error.request-too-large': 'The request body is too large.',
    };

    class ClientError extends Error {
      constructor(code, message, details) {
        super(message || code);
        this.name = 'ClientError';
        this.code = code || 'internal';
        this.details = details;
      }
    }

    function messageFor(t, code) {
      const key = `error.${code || 'internal'}`;
      const value = t(key);
      return value === key ? t('error.internal') : value;
    }

    function baseName(rel) {
      const index = rel.lastIndexOf('/');
      return index < 0 ? rel : rel.slice(index + 1);
    }

    function parentOf(rel) {
      const index = rel.lastIndexOf('/');
      return index < 0 ? '' : rel.slice(0, index);
    }

    function joinPath(dir, name) {
      return dir === '' ? name : `${dir}/${name}`;
    }

    function formatSize(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let value = bytes;
      let unit = 0;
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
      }
      return `${unit === 0 ? Math.round(value) : value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
    }

    let timeFormatter;
    function formatTime(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return '';
      try {
        timeFormatter ??= new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        return timeFormatter.format(new Date(ms));
      } catch {
        return '';
      }
    }

    function downloadUrl(sessionId, rel, inline) {
      const params = new URLSearchParams({ sessionId, path: rel });
      if (inline) params.set('inline', '1');
      return `${ROUTE_DOWNLOAD}?${params.toString()}`;
    }

    async function callOp(payload, signal) {
      let response;
      try {
        response = await fetch(ROUTE_OP, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-dsh-file-manager': '1' },
          body: JSON.stringify(payload),
          signal,
        });
      } catch (error) {
        if (error?.name === 'AbortError') throw new ClientError('aborted', 'The request was cancelled.');
        throw new ClientError('network', 'The file service could not be reached.');
      }
      let body;
      try {
        body = await response.json();
      } catch (error) {
        if (error?.name === 'AbortError') throw new ClientError('aborted', 'The request was cancelled.');
        throw new ClientError('network', 'The file service returned an invalid response.');
      }
      if (!body || body.ok !== true) {
        const error = body?.error ?? {};
        throw new ClientError(error.code || 'internal', error.message || 'The operation failed.', error.details);
      }
      return body.value;
    }

    function uploadFile({ sessionId, dir, file, signal, onProgress }) {
      return new Promise((resolve, reject) => {
        const params = new URLSearchParams({
          sessionId,
          dir,
          name: file.name,
          onConflict: 'rename',
        });
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${ROUTE_UPLOAD}?${params.toString()}`, true);
        xhr.setRequestHeader('x-dsh-file-manager', '1');
        xhr.setRequestHeader('content-type', 'application/octet-stream');
        let settled = false;
        const cleanup = () => {
          if (signal) signal.removeEventListener('abort', onAbort);
        };
        const fail = (code, message) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new ClientError(code, message));
        };
        const done = (value) => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        };
        const onAbort = () => {
          if (settled) return;
          xhr.abort();
          fail('aborted', 'The upload was cancelled.');
        };
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
        };
        xhr.onload = () => {
          let body;
          try {
            body = JSON.parse(xhr.responseText);
          } catch {
            fail('network', 'The upload response was invalid.');
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300 && body && body.ok === true) {
            done(body.value);
            return;
          }
          const error = body?.error ?? {};
          fail(error.code || 'internal', error.message || 'The upload failed.');
        };
        xhr.onerror = () => fail('network', 'The upload could not be sent.');
        xhr.onabort = () => fail('aborted', 'The upload was cancelled.');
        xhr.send(file);
        if (signal?.aborted) onAbort();
      });
    }

    function ensureStyle() {
      const previous = document.getElementById(STYLE_ID);
      if (previous) previous.remove();
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
      return style;
    }

    function Icon({ size = 16, viewBox = '0 0 16 16', children, className }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
          'aria-hidden': 'true',
          focusable: 'false',
        },
        children,
      );
    }

    function FolderIcon({ size = 16, className }) {
      return h(
        Icon,
        { size, className },
        h('path', { d: 'M1.8 4.1a1.1 1.1 0 0 1 1.1-1.1h2.9l1.4 1.5h5a1.1 1.1 0 0 1 1.1 1.1v6.3a1.1 1.1 0 0 1-1.1 1.1H2.9a1.1 1.1 0 0 1-1.1-1.1z' }),
      );
    }

    function FileIcon({ size = 16, className }) {
      return h(
        Icon,
        { size, className },
        h('path', { d: 'M4 1.7h5l3 3v9.6H4z' }),
        h('path', { d: 'M9 1.7v3h3' }),
      );
    }

    function SymlinkIcon({ size = 16, className }) {
      return h(
        Icon,
        { size, className },
        h('path', { d: 'M3.2 7.4a3 3 0 0 1 4.2 0l1.1 1.1' }),
        h('path', { d: 'M12.8 8.6a3 3 0 0 1-4.2 0L7.5 7.5' }),
        h('path', { d: 'M5.1 9.6 3.9 10.8a2.1 2.1 0 0 1-3-3l1.8-1.8' }),
        h('path', { d: 'M10.9 6.4l1.2-1.2a2.1 2.1 0 0 1 3 3l-1.8 1.8' }),
      );
    }

    function UpIcon({ size = 16 }) {
      return h(Icon, { size }, h('path', { d: 'M8 13V3' }), h('path', { d: 'M4 7l4-4 4 4' }));
    }

    function RefreshIcon({ size = 16 }) {
      return h(
        Icon,
        { size },
        h('path', { d: 'M13.2 6.2A5.4 5.4 0 1 0 13.5 10' }),
        h('path', { d: 'M13.2 2.8v3.4h-3.4' }),
      );
    }

    function PlusIcon({ size = 16 }) {
      return h(Icon, { size }, h('path', { d: 'M8 3v10' }), h('path', { d: 'M3 8h10' }));
    }

    function UploadIcon({ size = 16 }) {
      return h(
        Icon,
        { size },
        h('path', { d: 'M8 10.5V2.8' }),
        h('path', { d: 'M4.6 6.2 8 2.8l3.4 3.4' }),
        h('path', { d: 'M2.8 10.2v2.2a1 1 0 0 0 1 1h8.4a1 1 0 0 0 1-1v-2.2' }),
      );
    }

    function SearchIcon({ size = 14 }) {
      return h(
        Icon,
        { size },
        h('circle', { cx: 7, cy: 7, r: 4.2 }),
        h('path', { d: 'm10.2 10.2 3 3' }),
      );
    }

    function CloseIcon({ size = 14 }) {
      return h(Icon, { size }, h('path', { d: 'm3.5 3.5 9 9' }), h('path', { d: 'm12.5 3.5-9 9' }));
    }

    function MoreIcon({ size = 14 }) {
      return h(
        Icon,
        { size },
        h('circle', { cx: 3, cy: 8, r: 1, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 8, cy: 8, r: 1, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 13, cy: 8, r: 1, fill: 'currentColor', stroke: 'none' }),
      );
    }

    function ChevronRightIcon({ size = 14 }) {
      return h(Icon, { size }, h('path', { d: 'm6 3 5 5-5 5' }));
    }

    function ChevronDownIcon({ size = 14 }) {
      return h(Icon, { size }, h('path', { d: 'm3 6 5 5 5-5' }));
    }

    function DownloadIcon({ size = 14 }) {
      return h(
        Icon,
        { size },
        h('path', { d: 'M8 2.8v7.7' }),
        h('path', { d: 'm4.6 7.1 3.4 3.4 3.4-3.4' }),
        h('path', { d: 'M2.8 10.2v2.2a1 1 0 0 0 1 1h8.4a1 1 0 0 0 1-1v-2.2' }),
      );
    }

    function EyeIcon({ size = 14 }) {
      return h(
        Icon,
        { size },
        h('path', { d: 'M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4Z' }),
        h('circle', { cx: 8, cy: 8, r: 1.8 }),
      );
    }

    function PencilIcon({ size = 14 }) {
      return h(Icon, { size }, h('path', { d: 'm2.5 13.5.9-3.3 8-8 2.4 2.4-8 8z' }), h('path', { d: 'm10.2 3.4 2.4 2.4' }));
    }

    function CopyIcon({ size = 14 }) {
      return h(
        Icon,
        { size },
        h('rect', { x: 5.2, y: 5.2, width: 8.3, height: 8.3, rx: 1.2 }),
        h('path', { d: 'M10.8 5.2V3.4a1 1 0 0 0-1-1H3.4a1 1 0 0 0-1 1v6.4a1 1 0 0 0 1 1h1.8' }),
      );
    }

    function MoveIcon({ size = 14 }) {
      return h(
        Icon,
        { size },
        h('path', { d: 'M1.8 4.1a1.1 1.1 0 0 1 1.1-1.1h2.9l1.4 1.5h5a1.1 1.1 0 0 1 1.1 1.1v6.3a1.1 1.1 0 0 1-1.1 1.1H2.9a1.1 1.1 0 0 1-1.1-1.1z' }),
        h('path', { d: 'M6.2 8h4.4' }),
        h('path', { d: 'm9 6.4 1.6 1.6L9 9.6' }),
      );
    }

    function TrashIcon({ size = 14 }) {
      return h(
        Icon,
        { size },
        h('path', { d: 'M2.8 4.3h10.4' }),
        h('path', { d: 'M6.2 4.3V2.8h3.6v1.5' }),
        h('path', { d: 'm4.3 4.3.6 9h6.2l.6-9' }),
        h('path', { d: 'M6.7 7v3.6M9.3 7v3.6' }),
      );
    }

    function ImageIcon({ size = 16 }) {
      return h(
        Icon,
        { size },
        h('rect', { x: 2, y: 3, width: 12, height: 10, rx: 1.4 }),
        h('circle', { cx: 5.6, cy: 6.4, r: 1 }),
        h('path', { d: 'm3 11 3.1-3 2.2 2.1 1.8-1.7L14 12' }),
      );
    }

    function FileManagerGlyph({ size = 18, className }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className,
          'aria-hidden': 'true',
          focusable: 'false',
        },
        h('path', { d: 'M2.8 7.1A2.3 2.3 0 0 1 5.1 4.8h4l2 2h7.8a2.3 2.3 0 0 1 2.3 2.3v8.1a2.3 2.3 0 0 1-2.3 2.3H5.1a2.3 2.3 0 0 1-2.3-2.3z' }),
        h('path', { d: 'M6.6 11.1h10.8M6.6 14.1h7.8M6.6 17.1h5.4' }),
      );
    }

    function iconForKind(kind, size) {
      if (kind === 'directory') return h(FolderIcon, { size });
      if (kind === 'symlink') return h(SymlinkIcon, { size });
      return h(FileIcon, { size });
    }

    const IMAGE_NAME = /\.(bmp|gif|jpe?g|png|webp)$/i;
    const MAX_INLINE_IMAGE_BYTES = 32 * 1024 * 1024;

    function isImageName(name) {
      return IMAGE_NAME.test(name);
    }

    function printableText(value) {
      return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '\uFFFD');
    }

    function Button({ kind = 'default', children, className, ...rest }) {
      const variant = kind === 'primary' ? ' primary' : kind === 'danger' ? ' danger' : kind === 'dangerSolid' ? ' dangerSolid' : '';
      return h('button', {
        type: 'button',
        className: `dfm-btn${variant}${className ? ` ${className}` : ''}`,
        ...rest,
      }, children);
    }

    function ModalShell({ title, onClose, busy = false, t, children, footer }) {
      const titleId = typeof React.useId === 'function' ? React.useId() : 'dfm-dialog-title';
      const sheetRef = useRef(null);
      const closeRef = useRef(onClose);
      const busyRef = useRef(busy);
      closeRef.current = onClose;
      busyRef.current = busy;
      useEffect(() => {
        const previous = document.activeElement;
        const sheet = sheetRef.current;
        const first = sheet?.querySelector('[data-autofocus]') ?? sheet?.querySelector('input, button, select, textarea, a[href]');
        if (first instanceof HTMLElement) {
          try {
            first.focus();
            if (typeof first.select === 'function') first.select();
          } catch {
            /* ignore focus failures */
          }
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if (!busyRef.current) closeRef.current?.();
            return;
          }
          if (event.key !== 'Tab' || !sheet) return;
          const nodes = Array.from(sheet.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])'))
            .filter((node) => !node.disabled && node.offsetParent !== null);
          if (nodes.length === 0) return;
          const firstNode = nodes[0];
          const lastNode = nodes[nodes.length - 1];
          if (event.shiftKey && document.activeElement === firstNode) {
            event.preventDefault();
            lastNode.focus();
          } else if (!event.shiftKey && document.activeElement === lastNode) {
            event.preventDefault();
            firstNode.focus();
          }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
          document.removeEventListener('keydown', onKeyDown, true);
          if (previous instanceof HTMLElement && previous.isConnected) {
            try {
              previous.focus();
            } catch {
              /* ignore focus failures */
            }
          }
        };
      }, []);
      return h('div', {
        className: 'dfm-overlay',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget && !busy) onClose();
        },
      },
      h('div', {
        ref: sheetRef,
        className: 'dfm-sheet',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
      },
      h('div', { className: 'dfm-sheetHeader' },
        h('h2', { id: titleId, className: 'dfm-sheetTitle' }, title),
        h('button', {
          type: 'button',
          className: 'dfm-iconButton',
          'aria-label': t('common.close'),
          title: t('common.close'),
          onClick: onClose,
        }, h(CloseIcon, { size: 13 }))),
      h('div', { className: 'dfm-sheetBody' },
        children,
        footer ? h('div', { className: 'dfm-sheetFooter' }, footer) : null)));
    }

    function NameField({ id, label, value, onChange, placeholder, disabled }) {
      return h('div', null,
        h('label', { className: 'dfm-label', htmlFor: id }, label),
        h('input', {
          id,
          className: 'dfm-input',
          value,
          onChange: (event) => onChange(event.target.value),
          placeholder,
          'data-autofocus': 'true',
          disabled,
          maxLength: 255,
          spellCheck: false,
        }));
    }

    function MkdirSheet({ onClose, onSubmit, t }) {
      const [name, setName] = useState('');
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);
      const inputId = typeof React.useId === 'function' ? React.useId() : 'dfm-mkdir-name';
      const submit = async (event) => {
        if (event) event.preventDefault();
        if (busy) return;
        if (!name.trim()) {
          setError(t('error.invalid-name'));
          return;
        }
        setBusy(true);
        setError(null);
        try {
          await onSubmit(name);
          onClose();
        } catch (failure) {
          setError(messageFor(t, failure?.code));
          setBusy(false);
        }
      };
      return h(ModalShell, { title: t('mkdir.title'), onClose, busy, t },
        h('form', { className: 'dfm-form', onSubmit: submit },
          h(NameField, {
            id: inputId,
            label: t('common.name'),
            value: name,
            onChange: setName,
            placeholder: t('mkdir.placeholder'),
            disabled: busy,
          }),
          error ? h('p', { className: 'dfm-errorText', role: 'alert' }, error) : null,
          h('div', { className: 'dfm-sheetFooter' },
            h(Button, { onClick: onClose }, t('common.cancel')),
            h(Button, { kind: 'primary', type: 'submit', disabled: busy }, busy ? t('common.working') : t('common.create')))));
    }

    function RenameSheet({ entry, onClose, onSubmit, t }) {
      const [name, setName] = useState(entry.name);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);
      const inputId = typeof React.useId === 'function' ? React.useId() : 'dfm-rename-name';
      const submit = async (event) => {
        if (event) event.preventDefault();
        if (busy) return;
        if (!name.trim()) {
          setError(t('error.invalid-name'));
          return;
        }
        setBusy(true);
        setError(null);
        try {
          await onSubmit(name);
          onClose();
        } catch (failure) {
          setError(messageFor(t, failure?.code));
          setBusy(false);
        }
      };
      return h(ModalShell, { title: t('rename.title'), onClose, busy, t },
        h('form', { className: 'dfm-form', onSubmit: submit },
          h(NameField, {
            id: inputId,
            label: t('common.name'),
            value: name,
            onChange: setName,
            placeholder: t('rename.placeholder'),
            disabled: busy,
          }),
          error ? h('p', { className: 'dfm-errorText', role: 'alert' }, error) : null,
          h('div', { className: 'dfm-sheetFooter' },
            h(Button, { onClick: onClose }, t('common.cancel')),
            h(Button, { kind: 'primary', type: 'submit', disabled: busy }, busy ? t('common.working') : t('common.save')))));
    }

    function DeleteSheet({ entries, onClose, onConfirm, t }) {
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);
      const hasDirectory = entries.some((entry) => entry.kind === 'directory');
      const shown = entries.slice(0, 6);
      const submit = async () => {
        if (busy) return;
        setBusy(true);
        setError(null);
        try {
          await onConfirm(entries);
          onClose();
        } catch (failure) {
          setError(messageFor(t, failure?.code));
          setBusy(false);
        }
      };
      return h(ModalShell, {
        title: t('delete.title'),
        onClose,
        busy,
        t,
        footer: [
          h(Button, { key: 'cancel', onClick: onClose, 'data-autofocus': 'true' }, t('common.cancel')),
          h(Button, { key: 'delete', kind: 'dangerSolid', onClick: submit, disabled: busy }, busy ? t('common.working') : t('delete.confirm')),
        ],
      },
      h('p', { className: 'dfm-bodyText' }, t('delete.body', { count: entries.length })),
      hasDirectory ? h('p', { className: 'dfm-errorText' }, t('delete.bodyFolder')) : null,
      h('ul', { className: 'dfm-nameList' },
        shown.map((entry) => h('li', { key: entry.path }, entry.name)),
        entries.length > shown.length ? h('li', { className: 'is-more' }, t('delete.more', { count: entries.length - shown.length })) : null),
      error ? h('p', { className: 'dfm-errorText', role: 'alert' }, error) : null);
    }

    function PickerSheet({ mode, entries, initialDir, sessionId, onClose, onSubmit, t }) {
      const [dest, setDest] = useState(initialDir);
      const [dirs, setDirs] = useState([]);
      const [loading, setLoading] = useState(true);
      const [loadingMore, setLoadingMore] = useState(false);
      const [hasMore, setHasMore] = useState(false);
      const [nextOffset, setNextOffset] = useState(0);
      const [error, setError] = useState(null);
      const [busy, setBusy] = useState(false);
      const tRef = useRef(t);
      tRef.current = t;
      const moreRef = useRef(null);
      const destRef = useRef(dest);
      destRef.current = dest;
      useEffect(() => {
        let alive = true;
        const controller = new AbortController();
        moreRef.current?.abort();
        moreRef.current = null;
        setLoading(true);
        setLoadingMore(false);
        setDirs([]);
        setHasMore(false);
        setNextOffset(0);
        setError(null);
        callOp({ sessionId, action: 'list', path: dest, limit: LIST_PAGE_SIZE }, controller.signal)
          .then((value) => {
            if (!alive) return;
            setDirs((value.entries ?? []).filter((entry) => entry.kind === 'directory'));
            setHasMore(value.hasMore === true);
            setNextOffset(Number.isSafeInteger(value.nextOffset) ? value.nextOffset : 0);
            setLoading(false);
          })
          .catch((failure) => {
            if (!alive) return;
            setLoading(false);
            if (failure?.code === 'aborted') return;
            setDirs([]);
            setHasMore(false);
            setError(messageFor(tRef.current, failure?.code));
          });
        return () => {
          alive = false;
          controller.abort();
        };
      }, [dest, sessionId]);
      useEffect(() => () => {
        moreRef.current?.abort();
        moreRef.current = null;
      }, []);
      const loadMoreDirs = async () => {
        if (loadingMore || !hasMore) return;
        const key = dest;
        const controller = new AbortController();
        moreRef.current?.abort();
        moreRef.current = controller;
        setLoadingMore(true);
        try {
          const value = await callOp({
            sessionId,
            action: 'list',
            path: dest,
            offset: nextOffset,
            limit: LIST_PAGE_SIZE,
          }, controller.signal);
          if (key !== destRef.current) return;
          setDirs((current) => [...current, ...(value.entries ?? []).filter((entry) => entry.kind === 'directory')]);
          setHasMore(value.hasMore === true);
          setNextOffset(Number.isSafeInteger(value.nextOffset) ? value.nextOffset : nextOffset);
        } catch (failure) {
          if (failure?.code !== 'aborted') setError(messageFor(tRef.current, failure?.code));
        } finally {
          if (moreRef.current === controller) moreRef.current = null;
          setLoadingMore(false);
        }
      };
      const insideSelected = entries.some((entry) => entry.kind === 'directory' && (dest === entry.path || dest.startsWith(`${entry.path}/`)));
      const submit = async () => {
        if (busy) return;
        if (insideSelected) {
          setError(t('picker.invalid'));
          return;
        }
        setBusy(true);
        setError(null);
        try {
          await onSubmit(dest);
          onClose();
        } catch (failure) {
          setError(messageFor(t, failure?.code));
          setBusy(false);
        }
      };
      return h(ModalShell, {
        title: mode === 'move' ? t('move.title') : t('copy.title'),
        onClose,
        busy,
        t,
        footer: [
          h(Button, { key: 'cancel', onClick: onClose }, t('common.cancel')),
          h(Button, {
            key: 'choose',
            kind: 'primary',
            onClick: submit,
            disabled: busy || loading || insideSelected || Boolean(error),
          }, busy ? t('common.working') : t('picker.here')),
        ],
      },
      h('p', { className: 'dfm-bodyText' }, mode === 'move' ? t('move.body') : t('copy.body')),
      h('div', { className: 'dfm-dirPath' }, dest === '' ? t('list.root') : dest),
      h('div', { className: 'dfm-dirList' },
        h('button', { type: 'button', className: 'dfm-dirRow', onClick: () => setDest(parentOf(dest)), disabled: dest === '' || loading },
          h(UpIcon, { size: 14 }),
          h('span', { className: 'dfm-dirRowName' }, t('picker.up'))),
        loading
          ? h('div', { className: 'dfm-dirMore' }, t('picker.loading'))
          : dirs.length === 0 && !hasMore
            ? h('div', { className: 'dfm-dirMore' }, t('picker.empty'))
            : [
              ...dirs.map((dir) => h('button', {
                key: dir.path,
                type: 'button',
                className: 'dfm-dirRow',
                onClick: () => setDest(dir.path),
              },
              h(FolderIcon, { size: 14 }),
              h('span', { className: 'dfm-dirRowName' }, dir.name),
              h('span', { style: { marginLeft: 'auto' } }, h(ChevronRightIcon, { size: 12 })))),
              hasMore ? h('div', { key: 'more', className: 'dfm-dirMore' },
                h('button', {
                  type: 'button',
                  className: 'dfm-inlineButton',
                  onClick: loadMoreDirs,
                  disabled: loadingMore,
                }, loadingMore ? t('list.loading') : t('list.loadMore'))) : null,
            ]),
      insideSelected ? h('p', { className: 'dfm-errorText', role: 'alert' }, t('picker.invalid')) : null,
      error ? h('p', { className: 'dfm-errorText', role: 'alert' }, error) : null);
    }

    function PreviewSheet({ entry, sessionId, onClose, t }) {
      const image = isImageName(entry.name);
      const [state, setState] = useState({ status: 'loading', kind: image ? 'image' : 'text', text: '', truncated: false, error: null, imageBroken: false });
      useEffect(() => {
        let alive = true;
        const controller = new AbortController();
        setState({ status: 'loading', kind: image ? 'image' : 'text', text: '', truncated: false, error: null, imageBroken: false });
        if (image && entry.size > MAX_INLINE_IMAGE_BYTES) {
          setState({ status: 'error', kind: 'image', text: '', truncated: false, error: 'too-large', imageBroken: false });
          return undefined;
        }
        const request = image
          ? callOp({ sessionId, action: 'image-meta', path: entry.path }, controller.signal)
            .then((value) => {
              if (!value || value.previewable !== true) {
                return { error: value?.reason === 'too-large' ? 'too-large' : 'unsupported' };
              }
              return { ready: true };
            })
          : callOp({ sessionId, action: 'read', path: entry.path }, controller.signal)
            .then((value) => ({
              ready: true,
              text: value.text ?? '',
              truncated: value.truncated === true,
            }));
        request
          .then((value) => {
            if (!alive) return;
            if (value.error) {
              setState({ status: 'error', kind: image ? 'image' : 'text', text: '', truncated: false, error: value.error, imageBroken: false });
              return;
            }
            setState(image
              ? { status: 'ready', kind: 'image', text: '', truncated: false, error: null, imageBroken: false }
              : {
                status: 'ready',
                kind: 'text',
                text: value.text,
                truncated: value.truncated,
                error: null,
                imageBroken: false,
              });
          })
          .catch((failure) => {
            if (!alive) return;
            if (failure?.code === 'aborted') return;
            setState({ status: 'error', kind: image ? 'image' : 'text', text: '', truncated: false, error: failure?.code ?? 'internal', imageBroken: false });
          });
        return () => {
          alive = false;
          controller.abort();
        };
      }, [entry.path, image, sessionId, entry.size]);
      let content;
      if (state.status === 'loading') {
        content = h('div', { className: 'dfm-empty' }, t('preview.loading'));
      } else if (state.status === 'error') {
        const text = state.error === 'not-text'
          ? t('preview.binary')
          : state.error === 'too-large'
            ? t('preview.tooLarge')
            : state.error === 'unsupported'
              ? t('preview.noPreview')
              : messageFor(t, state.error);
        content = h('p', { className: 'dfm-errorText', role: 'alert' }, text);
      } else if (state.kind === 'image') {
        content = state.imageBroken
          ? h('p', { className: 'dfm-errorText' }, t('preview.noPreview'))
          : h('img', {
            className: 'dfm-previewImg',
            src: downloadUrl(sessionId, entry.path, true),
            alt: t('preview.imageAlt', { name: entry.name }),
            onError: () => setState((current) => ({ ...current, imageBroken: true })),
          });
      } else {
        content = [
          state.truncated ? h('p', { key: 'truncated', className: 'dfm-hint' }, t('preview.truncated')) : null,
          h('pre', { key: 'text', className: 'dfm-pre' }, printableText(state.text)),
        ];
      }
      return h(ModalShell, {
        title: t('preview.title'),
        onClose,
        t,
        footer: [
          h('a', {
            key: 'download',
            className: 'dfm-btn',
            href: downloadUrl(sessionId, entry.path, false),
            download: entry.name,
          }, h(DownloadIcon, { size: 13 }), t('preview.download')),
          h(Button, { key: 'close', onClick: onClose }, t('common.close')),
        ],
      },
      h('div', { className: 'dfm-preview' },
        h('div', { className: 'dfm-metaLine' }, `${entry.name} · ${formatSize(entry.size)}${entry.mtimeMs ? ` · ${formatTime(entry.mtimeMs)}` : ''}`),
        content));
    }

    function FileManagerTitle({ useTabInfo }) {
      const { tab } = useTabInfo();
      return h('span', { className: 'dfm-title' },
        h(FileManagerGlyph, { size: 14 }),
        h('span', { className: 'dfm-titleText' }, tab?.title ?? ''));
    }

    function FileManagerBody({ sessionId, useSessions, useTabInfo, t }) {
      const tr = typeof t === 'function' ? t : (key) => key;
      const { tab } = useTabInfo();
      const cwd = useSessions((sessions) => sessions.byId[sessionId]?.cwd);
      const [path, setPath] = useState('');
      const [entries, setEntries] = useState([]);
      const [rootPath, setRootPath] = useState('');
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);
      const [selected, setSelected] = useState(() => new Set());
      const [query, setQuery] = useState('');
      const [activeQuery, setActiveQuery] = useState('');
      const [listKey, setListKey] = useState('');
      const [hasMore, setHasMore] = useState(false);
      const [scanTruncated, setScanTruncated] = useState(false);
      const [scanLimit, setScanLimit] = useState(0);
      const [skipped, setSkipped] = useState(0);
      const [nextOffset, setNextOffset] = useState(0);
      const [total, setTotal] = useState(0);
      const [loadingMore, setLoadingMore] = useState(false);
      const [menuPath, setMenuPath] = useState(null);
      const [modal, setModal] = useState(null);
      const [notice, setNotice] = useState(null);
      const [uploads, setUploads] = useState([]);
      const [dragging, setDragging] = useState(false);
      const [refreshToken, setRefreshToken] = useState(0);
      const fileInputRef = useRef(null);
      const uploadAbortRef = useRef(null);
      const moreAbortRef = useRef(null);
      const opAbortRef = useRef(null);
      const loadMoreRef = useRef(false);
      const dragDepth = useRef(0);

      const currentListKey = `${sessionId ?? ''}\u0000${cwd ?? ''}\u0000${path}\u0000${activeQuery}`;
      const listKeyRef = useRef(currentListKey);
      listKeyRef.current = currentListKey;
      const currentEntries = listKey === currentListKey ? entries : EMPTY_ENTRIES;
      const listPending = Boolean(sessionId && cwd) && (loading || listKey !== currentListKey);

      const reload = useCallback(() => setRefreshToken((value) => value + 1), []);

      useEffect(() => {
        if (!tab?.actions?.bindCommands) return undefined;
        return tab.actions.bindCommands({ refresh: reload });
      }, [tab?.actions, reload]);

      useEffect(() => {
        setPath('');
        setSelected(new Set());
        setQuery('');
        setActiveQuery('');
        setMenuPath(null);
        opAbortRef.current?.abort();
        opAbortRef.current = null;
        setModal(null);
        setNotice(null);
        setUploads([]);
        setError(null);
        setEntries([]);
        setRootPath('');
        setListKey('');
        setHasMore(false);
        setScanTruncated(false);
        setScanLimit(0);
        setSkipped(0);
        setTotal(0);
        setNextOffset(0);
        setLoadingMore(false);
        uploadAbortRef.current?.abort();
        uploadAbortRef.current = null;
        moreAbortRef.current?.abort();
        moreAbortRef.current = null;
      }, [cwd]);

      useEffect(() => () => {
        uploadAbortRef.current?.abort();
        uploadAbortRef.current = null;
        moreAbortRef.current?.abort();
        moreAbortRef.current = null;
      }, []);

      useEffect(() => {
        const timer = setTimeout(() => setActiveQuery(query.trim()), 250);
        return () => clearTimeout(timer);
      }, [query]);

      useEffect(() => {
        setSelected(new Set());
        setMenuPath(null);
      }, [path, activeQuery, sessionId, cwd]);

      useEffect(() => {
        if (!sessionId || !cwd) return undefined;
        let alive = true;
        const controller = new AbortController();
        const key = currentListKey;
        moreAbortRef.current?.abort();
        moreAbortRef.current = null;
        setLoadingMore(false);
        setLoading(true);
        setError(null);
        callOp({
          sessionId,
          action: 'list',
          path,
          ...(activeQuery ? { query: activeQuery } : {}),
          offset: 0,
          limit: LIST_PAGE_SIZE,
        }, controller.signal)
          .then((value) => {
            if (!alive || key !== listKeyRef.current) return;
            const nextEntries = value.entries ?? [];
            setLoading(false);
            setEntries(nextEntries);
            setRootPath(value.root ?? cwd);
            setListKey(key);
            setHasMore(value.hasMore === true);
            setScanTruncated(value.scanTruncated === true);
            setScanLimit(Number.isSafeInteger(value.scanLimit) ? value.scanLimit : 0);
            setSkipped(Number.isSafeInteger(value.skipped) ? value.skipped : 0);
            setNextOffset(Number.isSafeInteger(value.nextOffset) ? value.nextOffset : nextEntries.length);
            setTotal(Number.isSafeInteger(value.total) ? value.total : nextEntries.length);
            setError(null);
            const present = new Set(nextEntries.map((entry) => entry.path));
            setSelected((current) => {
              if (current.size === 0) return current;
              let changed = false;
              const next = new Set();
              for (const item of current) {
                if (present.has(item)) next.add(item);
                else changed = true;
              }
              return changed ? next : current;
            });
          })
          .catch((failure) => {
            if (!alive) return;
            setLoading(false);
            if (failure?.code === 'aborted') return;
            if (failure?.code === 'not-found' && path !== '') {
              setPath(parentOf(path));
              return;
            }
            setEntries([]);
            setRootPath('');
            setListKey(key);
            setHasMore(false);
            setScanTruncated(false);
            setSkipped(0);
            setTotal(0);
            setNextOffset(0);
            setError(failure);
          });
        return () => {
          alive = false;
          controller.abort();
        };
      }, [sessionId, cwd, path, activeQuery, refreshToken, currentListKey]);

      useEffect(() => () => {
        opAbortRef.current?.abort();
        opAbortRef.current = null;
      }, []);

      useEffect(() => {
        if (!notice) return undefined;
        const timer = setTimeout(() => setNotice(null), 6000);
        return () => clearTimeout(timer);
      }, [notice]);

      useEffect(() => {
        if (uploads.length === 0) return undefined;
        const active = uploads.some((item) => item.status === 'queued' || item.status === 'uploading');
        if (active) return undefined;
        if (!uploads.some((item) => item.status === 'done')) return undefined;
        const timer = setTimeout(() => {
          setUploads((current) => current.filter((item) => item.status !== 'done'));
        }, 3000);
        return () => clearTimeout(timer);
      }, [uploads]);

      const visibleEntries = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return currentEntries;
        return currentEntries.filter((entry) => entry.name.toLowerCase().includes(needle));
      }, [currentEntries, query]);

      const selectedEntries = useMemo(
        () => currentEntries.filter((entry) => selected.has(entry.path)),
        [currentEntries, selected],
      );

      const crumbs = useMemo(() => {
        const list = [{ name: tr('header.root'), path: '' }];
        let accumulated = '';
        for (const segment of path.split('/')) {
          if (!segment) continue;
          accumulated = joinPath(accumulated, segment);
          list.push({ name: segment, path: accumulated });
        }
        return list;
      }, [path, tr]);

      const allVisibleSelected = visibleEntries.length > 0 && visibleEntries.every((entry) => selected.has(entry.path));
      const activeUploads = uploads.some((item) => item.status === 'queued' || item.status === 'uploading');
      const canCopySelection = selectedEntries.length > 0 && selectedEntries.every((entry) => entry.kind === 'file' || entry.kind === 'directory');

      const toggleEntry = (entryPath) => {
        if (!selected.has(entryPath) && selected.size >= MAX_SELECTION) {
          setNotice(tr('selection.tooMany', { count: MAX_SELECTION }));
          return;
        }
        setSelected((current) => {
          const next = new Set(current);
          if (next.has(entryPath)) next.delete(entryPath);
          else if (next.size < MAX_SELECTION) next.add(entryPath);
          else return current;
          return next;
        });
      };

      const toggleAll = () => {
        if (!allVisibleSelected) {
          const room = MAX_SELECTION - selected.size;
          const additions = visibleEntries.filter((entry) => !selected.has(entry.path));
          if (additions.length > room) setNotice(tr('selection.tooMany', { count: MAX_SELECTION }));
        }
        setSelected((current) => {
          const next = new Set(current);
          if (allVisibleSelected) {
            for (const entry of visibleEntries) next.delete(entry.path);
            return next;
          }
          for (const entry of visibleEntries) {
            if (next.size >= MAX_SELECTION) break;
            next.add(entry.path);
          }
          return next;
        });
      };

      const loadMore = async () => {
        if (loadMoreRef.current || loadingMore || !hasMore || listKey !== currentListKey) return;
        loadMoreRef.current = true;
        const key = currentListKey;
        const offset = nextOffset;
        moreAbortRef.current?.abort();
        const controller = new AbortController();
        moreAbortRef.current = controller;
        setLoadingMore(true);
        setError(null);
        try {
          const value = await callOp({
            sessionId,
            action: 'list',
            path,
            ...(activeQuery ? { query: activeQuery } : {}),
            offset,
            limit: LIST_PAGE_SIZE,
          }, controller.signal);
          if (key !== listKeyRef.current) return;
          const nextEntries = value.entries ?? [];
          setEntries((current) => {
            const seen = new Set(current.map((entry) => entry.path));
            const additions = nextEntries.filter((entry) => !seen.has(entry.path));
            return additions.length > 0 ? [...current, ...additions] : current;
          });
          setHasMore(value.hasMore === true);
          setScanTruncated(value.scanTruncated === true);
          setScanLimit(Number.isSafeInteger(value.scanLimit) ? value.scanLimit : scanLimit);
          setSkipped((current) => current + (Number.isSafeInteger(value.skipped) ? value.skipped : 0));
          setNextOffset(Number.isSafeInteger(value.nextOffset) ? value.nextOffset : offset + nextEntries.length);
          setTotal(Number.isSafeInteger(value.total) ? value.total : total);
        } catch (failure) {
          if (failure?.code !== 'aborted') setError(failure);
        } finally {
          if (moreAbortRef.current === controller) moreAbortRef.current = null;
          loadMoreRef.current = false;
          setLoadingMore(false);
        }
      };

      const updateUpload = (id, patch) => {
        setUploads((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
      };

      const handleFiles = (fileList) => {
        const files = Array.from(fileList ?? []);
        if (files.length === 0) return;
        if (files.length > MAX_UPLOAD_FILES) {
          setNotice(tr('upload.tooMany'));
          return;
        }
        const totalBytes = files.reduce((sum, file) => sum + (Number.isFinite(file.size) ? file.size : 0), 0);
        if (totalBytes > MAX_UPLOAD_TOTAL_BYTES) {
          setNotice(tr('upload.totalTooLarge'));
          return;
        }
        const dir = path;
        const items = files.map((file, index) => ({
          id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
          name: file.name,
          size: file.size,
          progress: 0,
          status: 'queued',
          error: null,
        }));
        setUploads((current) => [...current, ...items]);
        const controller = new AbortController();
        uploadAbortRef.current?.abort();
        uploadAbortRef.current = controller;
        let succeeded = 0;
        (async () => {
          for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            const item = items[index];
            if (controller.signal.aborted) {
              updateUpload(item.id, { status: 'cancelled' });
              continue;
            }
            if (file.size > MAX_UPLOAD_BYTES) {
              updateUpload(item.id, { status: 'error', error: 'too-large' });
              continue;
            }
            updateUpload(item.id, { status: 'uploading' });
            try {
              await uploadFile({
                sessionId,
                dir,
                file,
                signal: controller.signal,
                onProgress: (progress) => updateUpload(item.id, { progress }),
              });
              succeeded += 1;
              updateUpload(item.id, { status: 'done', progress: 1 });
            } catch (failure) {
              updateUpload(item.id, {
                status: failure?.code === 'aborted' ? 'cancelled' : 'error',
                error: failure?.code ?? 'internal',
                progress: 0,
              });
            }
          }
          if (uploadAbortRef.current === controller) uploadAbortRef.current = null;
          if (succeeded > 0) {
            setNotice(succeeded === 1 ? tr('notice.uploaded') : tr('notice.uploadedMany', { count: succeeded }));
            reload();
          }
        })();
      };

      const handleFileInput = (event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (files.length > 0) handleFiles(files);
      };

      const cancelUploads = () => {
        uploadAbortRef.current?.abort();
        uploadAbortRef.current = null;
        setUploads((current) => current.map((item) => (
          item.status === 'queued' || item.status === 'uploading'
            ? { ...item, status: 'cancelled' }
            : item
        )));
      };

      const openRename = (entry) => {
        setMenuPath(null);
        setModal({ type: 'rename', entry });
      };

      const openDelete = (list) => {
        if (list.length === 0) return;
        setMenuPath(null);
        setModal({ type: 'delete', entries: list });
      };

      const openPicker = (mode, list) => {
        if (list.length === 0) return;
        setMenuPath(null);
        setModal({ type: 'picker', mode, entries: list });
      };

      const openPreview = (entry) => {
        if (entry.kind !== 'file') {
          setNotice(tr('row.unavailable'));
          return;
        }
        setMenuPath(null);
        setModal({ type: 'preview', entry });
      };

      const openEntry = (entry) => {
        if (entry.kind === 'directory') {
          setMenuPath(null);
          setPath(entry.path);
        } else {
          openPreview(entry);
        }
      };

      const showBatchNotice = (value, successKey) => {
        const failure = value?.results?.find((item) => !item.ok);
        if (failure) {
          setNotice(`${tr('notice.partial', { failed: value.failed })} ${messageFor(tr, failure.error?.code)}`);
        } else {
          setNotice(tr(successKey, { count: value?.succeeded ?? 0 }));
        }
      };

      const closeModal = () => {
        opAbortRef.current?.abort();
        opAbortRef.current = null;
        setModal(null);
      };

      const runOp = async (payload) => {
        opAbortRef.current?.abort();
        const controller = new AbortController();
        opAbortRef.current = controller;
        try {
          return await callOp(payload, controller.signal);
        } finally {
          if (opAbortRef.current === controller) opAbortRef.current = null;
        }
      };

      const submitMkdir = async (name) => {
        await runOp({ sessionId, action: 'mkdir', path, name });
        setNotice(tr('notice.mkdir'));
        reload();
      };

      const submitRename = async (entry, name) => {
        await runOp({ sessionId, action: 'rename', path: entry.path, name });
        setSelected(new Set());
        setNotice(tr('notice.rename'));
        reload();
      };

      const submitDelete = async (list) => {
        const value = await runOp({ sessionId, action: 'delete', paths: list.map((entry) => entry.path) });
        setSelected(new Set());
        showBatchNotice(value, 'notice.delete');
        reload();
      };

      const submitTransfer = async (mode, list, dest) => {
        const value = await runOp({
          sessionId,
          action: mode,
          paths: list.map((entry) => entry.path),
          dest,
        });
        setSelected(new Set());
        showBatchNotice(value, mode === 'move' ? 'notice.move' : 'notice.copy');
        reload();
      };

      const onDragEnter = (event) => {
        if (modal) return;
        const types = Array.from(event.dataTransfer?.types ?? []);
        if (!types.includes('Files')) return;
        event.preventDefault();
        dragDepth.current += 1;
        if (dragDepth.current === 1) setDragging(true);
      };

      const onDragOver = (event) => {
        if (modal) return;
        const types = Array.from(event.dataTransfer?.types ?? []);
        if (!types.includes('Files')) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      };

      const handleShellMouseDown = (event) => {
        if (menuPath === null) return;
        const target = event.target;
        if (target && typeof target.closest === 'function'
          && (target.closest('.dfm-inlineActions') || target.closest('.dfm-moreButton'))) return;
        setMenuPath(null);
      };

      const onDragLeave = () => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      };

      const onDrop = (event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (modal) return;
        const items = Array.from(event.dataTransfer?.items ?? []);
        const hasFolder = items.some((item) => {
          try {
            return item.webkitGetAsEntry?.()?.isDirectory === true;
          } catch {
            return false;
          }
        });
        if (hasFolder) {
          setNotice(tr('upload.folderUnsupported'));
          return;
        }
        if (event.dataTransfer?.files?.length) handleFiles(event.dataTransfer.files);
      };

      if (!sessionId || !cwd) {
        return h('div', { className: 'dfm-shell' },
          h('div', { className: 'dfm-empty' },
            h('p', null, tr('noWorkspace')),
            h('p', { className: 'dfm-hint' }, tr('noWorkspaceHint'))));
      }

      const renderAction = (label, icon, onClick, danger = false) => h('button', {
        type: 'button',
        className: `dfm-inlineButton${danger ? ' danger' : ''}`,
        onClick,
      }, icon, label);

      const renderRow = (entry) => {
        const isSelected = selected.has(entry.path);
        const menuOpen = menuPath === entry.path;
        const meta = entry.kind === 'directory'
          ? tr('row.folder')
          : entry.kind === 'file'
            ? formatSize(entry.size)
            : entry.kind === 'symlink'
              ? tr('row.symlink')
              : tr('row.other');
        const metaTitle = entry.kind === 'file'
          ? `${formatSize(entry.size)}${entry.mtimeMs ? ` · ${formatTime(entry.mtimeMs)}` : ''}`
          : meta;
        return h('div', {
          key: entry.path,
          className: `dfm-row${isSelected ? ' is-selected' : ''}`,
        },
        h('input', {
          type: 'checkbox',
          className: 'dfm-rowCheck',
          checked: isSelected,
          onChange: () => toggleEntry(entry.path),
          'aria-label': `${tr('row.selected')}: ${entry.name}`,
        }),
        h('span', { className: `dfm-rowIcon${entry.kind === 'directory' ? ' is-dir' : entry.kind === 'symlink' ? ' is-link' : ''}` },
          iconForKind(entry.kind, 15)),
        h('button', {
          type: 'button',
          className: 'dfm-rowName',
          title: entry.name,
          onClick: () => openEntry(entry),
        }, entry.name),
        h('span', { className: 'dfm-meta', title: metaTitle }, meta),
        h('button', {
          type: 'button',
          className: 'dfm-iconButton dfm-moreButton',
          'aria-label': tr('row.menu'),
          'aria-expanded': menuOpen,
          title: tr('row.menu'),
          onClick: () => setMenuPath(menuOpen ? null : entry.path),
        }, h(MoreIcon, { size: 14 })),
        menuOpen ? h('div', { className: 'dfm-inlineActions' },
          entry.kind === 'directory'
            ? renderAction(tr('row.open'), h(FolderIcon, { size: 12 }), () => openEntry(entry))
            : entry.kind === 'file'
              ? renderAction(tr('row.preview'), h(EyeIcon, { size: 12 }), () => openPreview(entry))
              : null,
          entry.kind === 'file'
            ? h('a', {
              className: 'dfm-inlineButton',
              href: downloadUrl(sessionId, entry.path, false),
              download: entry.name,
            }, h(DownloadIcon, { size: 12 }), tr('row.download'))
            : null,
          renderAction(tr('row.rename'), h(PencilIcon, { size: 12 }), () => openRename(entry)),
          entry.kind === 'file' || entry.kind === 'directory'
            ? renderAction(tr('row.copy'), h(CopyIcon, { size: 12 }), () => openPicker('copy', [entry]))
            : null,
          renderAction(tr('row.move'), h(MoveIcon, { size: 12 }), () => openPicker('move', [entry])),
          renderAction(tr('row.delete'), h(TrashIcon, { size: 12 }), () => openDelete([entry]), true)
        ) : null);
      };

      let listContent;
      if (listPending) {
        listContent = h('div', { className: 'dfm-empty' }, h('p', null, tr('list.loading')));
      } else if (error && currentEntries.length === 0) {
        listContent = null;
      } else if (visibleEntries.length === 0) {
        listContent = h('div', { className: 'dfm-empty' },
          h('p', null, query.trim() ? tr('list.noMatch') : tr('list.empty')),
          h('p', { className: 'dfm-hint' }, tr('list.emptyHint')),
          hasMore ? h('button', {
            type: 'button',
            className: 'dfm-inlineButton',
            onClick: loadMore,
            disabled: loadingMore,
          }, loadingMore ? tr('list.loading') : tr('list.loadMore')) : null);
      } else {
        listContent = [
          ...visibleEntries.map(renderRow),
          hasMore ? h('div', { key: 'load-more', className: 'dfm-listMore' },
            h('button', {
              type: 'button',
              className: 'dfm-inlineButton',
              onClick: loadMore,
              disabled: loadingMore,
            }, loadingMore ? tr('list.loading') : tr('list.loadMore'))) : null,
        ];
      }

      let modalView = null;
      if (modal?.type === 'mkdir') {
        modalView = h(MkdirSheet, {
          onClose: closeModal,
          onSubmit: submitMkdir,
          t: tr,
        });
      } else if (modal?.type === 'rename') {
        modalView = h(RenameSheet, {
          entry: modal.entry,
          onClose: closeModal,
          onSubmit: (name) => submitRename(modal.entry, name),
          t: tr,
        });
      } else if (modal?.type === 'delete') {
        modalView = h(DeleteSheet, {
          entries: modal.entries,
          onClose: closeModal,
          onConfirm: submitDelete,
          t: tr,
        });
      } else if (modal?.type === 'picker') {
        modalView = h(PickerSheet, {
          mode: modal.mode,
          entries: modal.entries,
          initialDir: path,
          sessionId,
          onClose: closeModal,
          onSubmit: (dest) => submitTransfer(modal.mode, modal.entries, dest),
          t: tr,
        });
      } else if (modal?.type === 'preview') {
        modalView = h(PreviewSheet, {
          entry: modal.entry,
          sessionId,
          onClose: closeModal,
          t: tr,
        });
      }

      const uploadPanel = uploads.length > 0 ? h('div', { className: 'dfm-panel' },
        h('div', { className: 'dfm-panelHeader' },
          h('span', null, tr('upload.title')),
          h('button', {
            type: 'button',
            className: 'dfm-inlineButton',
            onClick: () => { if (!activeUploads) setUploads([]); },
            disabled: activeUploads,
          }, tr('upload.clear'))),
        uploads.map((item) => h('div', { key: item.id, className: 'dfm-uploadRow' },
          h('span', { className: 'dfm-uploadName', title: item.name }, item.name),
          h('span', {
            className: `dfm-uploadStatus${item.status === 'error' ? ' is-error' : ''}`,
            title: item.status === 'error' ? messageFor(tr, item.error) : undefined,
          }, item.status === 'queued'
            ? tr('upload.queued')
            : item.status === 'uploading'
              ? `${Math.round(item.progress * 100)}%`
              : item.status === 'done'
                ? tr('upload.done')
                : item.status === 'cancelled'
                  ? tr('upload.cancelled')
                  : messageFor(tr, item.error)),
          h('div', { className: 'dfm-progress' },
            h('span', { style: { width: `${Math.round(item.progress * 100)}%` } })))),
        activeUploads ? h('button', {
          type: 'button',
          className: 'dfm-btn danger',
          onClick: cancelUploads,
        }, tr('upload.cancel')) : null) : null;

      return h('div', {
        className: 'dfm-shell',
        onMouseDown: handleShellMouseDown,
        onDragEnter,
        onDragOver,
        onDragLeave,
        onDrop,
      },
      h('div', { className: 'dfm-header' },
        h('div', { className: 'dfm-toolbar' },
          h('button', {
            type: 'button',
            className: 'dfm-iconButton',
            'aria-label': tr('header.up'),
            title: tr('header.up'),
            disabled: path === '',
            onClick: () => setPath(parentOf(path)),
          }, h(UpIcon, { size: 15 })),
          h('div', { className: 'dfm-crumbs' },
            crumbs.map((crumb, index) => h(React.Fragment, { key: `crumb:${index}:${crumb.path}` },
              index > 0 ? h('span', { className: 'dfm-crumbSep' }, '/') : null,
              h('button', {
                type: 'button',
                className: `dfm-crumb${crumb.path === path ? ' is-current' : ''}`,
                title: crumb.name,
                onClick: () => setPath(crumb.path),
              }, crumb.name)))),
          h('div', { className: 'dfm-tools' },
            h('button', {
              type: 'button',
              className: 'dfm-iconButton',
              'aria-label': tr('header.refresh'),
              title: tr('header.refresh'),
              disabled: loading,
              onClick: reload,
            }, h(RefreshIcon, { size: 15 })),
            h('button', {
              type: 'button',
              className: 'dfm-iconButton',
              'aria-label': tr('header.newFolder'),
              title: tr('header.newFolder'),
              onClick: () => setModal({ type: 'mkdir' }),
            }, h(PlusIcon, { size: 15 })),
            h('button', {
              type: 'button',
              className: 'dfm-iconButton',
              'aria-label': tr('header.upload'),
              title: tr('header.upload'),
              onClick: () => fileInputRef.current?.click(),
            }, h(UploadIcon, { size: 15 })))),
        h('div', {
          className: 'dfm-workspace',
          title: (listKey === currentListKey ? rootPath : '') || cwd,
        },
          h(FolderIcon, { size: 12 }),
          h('span', { className: 'dfm-workspaceText' }, (listKey === currentListKey ? rootPath : '') || cwd))),
      h('div', { className: 'dfm-selectRow' },
        h('input', {
          type: 'checkbox',
          className: 'dfm-checkbox',
          checked: allVisibleSelected,
          onChange: toggleAll,
          disabled: visibleEntries.length === 0,
          'aria-label': allVisibleSelected ? tr('header.selectNone') : tr('header.selectAll'),
        }),
        h('div', { className: 'dfm-search' },
          h(SearchIcon, { size: 13 }),
          h('input', {
            className: 'dfm-searchInput',
            value: query,
            onChange: (event) => setQuery(event.target.value),
            placeholder: tr('search.placeholder'),
            'aria-label': tr('search.placeholder'),
            maxLength: 256,
          }),
          query ? h('button', {
            type: 'button',
            className: 'dfm-searchClear',
            'aria-label': tr('search.clear'),
            title: tr('search.clear'),
            onClick: () => setQuery(''),
          }, h(CloseIcon, { size: 12 })) : null)),
      selectedEntries.length > 0 ? h('div', { className: 'dfm-selection' },
        h('span', { className: 'dfm-selectionCount' }, tr('selection.count', { count: selected.size })),
        selectedEntries.length === 1
          ? h('button', { type: 'button', className: 'dfm-inlineButton', onClick: () => openRename(selectedEntries[0]) }, tr('selection.rename'))
          : null,
        h('button', {
          type: 'button',
          className: 'dfm-inlineButton',
          onClick: () => openPicker('move', selectedEntries),
        }, tr('selection.move')),
        h('button', {
          type: 'button',
          className: 'dfm-inlineButton',
          onClick: () => openPicker('copy', selectedEntries),
          disabled: !canCopySelection,
        }, tr('selection.copy')),
        h('button', {
          type: 'button',
          className: 'dfm-inlineButton danger',
          onClick: () => openDelete(selectedEntries),
        }, tr('selection.delete')),
        h('button', {
          type: 'button',
          className: 'dfm-inlineButton',
          onClick: () => setSelected(new Set()),
        }, tr('selection.clear'))) : null,
      error ? h('div', { className: 'dfm-banner is-error', role: 'alert' },
        h('span', { className: 'dfm-bannerText' }, messageFor(tr, error.code)),
        h('button', { type: 'button', className: 'dfm-inlineButton', onClick: reload }, tr('list.retry')),
        h('button', {
          type: 'button',
          className: 'dfm-bannerClose',
          'aria-label': tr('common.close'),
          onClick: () => setError(null),
        }, h(CloseIcon, { size: 12 }))) : null,
      notice ? h('div', { className: 'dfm-banner is-notice', role: 'status' },
        h('span', { className: 'dfm-bannerText' }, notice),
        h('button', {
          type: 'button',
          className: 'dfm-bannerClose',
          'aria-label': tr('common.close'),
          onClick: () => setNotice(null),
        }, h(CloseIcon, { size: 12 }))) : null,
      scanTruncated ? h('div', { className: 'dfm-banner', role: 'status' },
        h('span', { className: 'dfm-bannerText' }, tr('list.scanTruncated', { count: scanLimit }))) : null,
      skipped > 0 ? h('div', { className: 'dfm-banner', role: 'status' },
        h('span', { className: 'dfm-bannerText' }, tr('list.skipped', { count: skipped }))) : null,
      loading && currentEntries.length > 0 ? h('div', { className: 'dfm-loadingLine' }) : null,
      h('div', { className: 'dfm-list' }, listContent),
      uploadPanel,
      h('input', {
        ref: fileInputRef,
        type: 'file',
        multiple: true,
        className: 'dfm-hiddenInput',
        onChange: handleFileInput,
        tabIndex: -1,
        'aria-hidden': 'true',
      }),
      dragging ? h('div', { className: 'dfm-dropHint' },
        h(UploadIcon, { size: 24 }),
        h('span', null, tr('upload.drop'))) : null,
      modalView);
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS);

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-file-manager: dictionaries');

      ctx.effect(() => {
        const style = ensureStyle();
        return () => {
          if (style && style.isConnected) style.remove();
        };
      }, 'dsh-file-manager: styles');

      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: DEF_ID,
        kind: KIND,
        priority: 'extension',
        title: () => t('tab.title'),
        guide: [{
          id: 'file-manager',
          order: 20,
          title: () => t('guide.title'),
          description: () => t('guide.description'),
          icon: FileManagerGlyph,
        }],
      }), 'dsh-file-manager: tab type');

      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab',
        key: DEF_ID,
        locale: NS,
      }, FileManagerBody)), 'dsh-file-manager: tab body');

      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab.title',
        key: DEF_ID,
      }, FileManagerTitle)), 'dsh-file-manager: tab title');

      function FilesAction({ t: slotT }) {
        const tr = typeof slotT === 'function' ? slotT : t;
        return h('button', {
          type: 'button',
          className: 'dfm-iconButton dfm-filesAction',
          'aria-label': tr('files.action.open'),
          title: tr('files.action.open'),
          onClick: (event) => {
            event.stopPropagation();
            try {
              ctx.sidebarRight.openTab(KIND);
            } catch (error) {
              ctx.logger?.warn?.('dsh-file-manager: failed to open the file manager tab', error);
            }
          },
        }, h(FileManagerGlyph, { size: 15 }));
      }

      ctx.effect(() => ctx.slots.inject('sidebar.right.tab.files.actions', () => ctx.slots.register({
        name: 'sidebar.right.tab.files.actions',
        id: 'workspace-file-manager',
        order: 100,
        locale: NS,
      }, FilesAction)), 'dsh-file-manager: files tab action');
    }


    exports.apply = apply;
    exports.inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight'];
    return module.exports;
  },
});
