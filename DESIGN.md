---
name: "简历优化助手"
description: "以手机岗位票夹组织真实经历、求职方向与生成进度的原生小程序"
colors:
  forest-action: "#1F6B4F"
  forest-deep: "#184C3A"
  paper-canvas: "#F4F1E8"
  paper-surface: "#FFFDF6"
  carbon-ink: "#17211B"
  muted-ink: "#667069"
  paper-line: "#D8D4C9"
  golden-code: "#D99A2B"
  danger: "#A43D32"
  success-wash: "#E4EEE8"
  error-wash: "#F5E3DF"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "52rpx"
    fontWeight: 720
    lineHeight: 1.18
    letterSpacing: "-1rpx"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "34rpx"
    fontWeight: 680
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "29rpx"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "SFMono-Regular, Consolas, monospace"
    fontSize: "25rpx"
    fontWeight: 720
    lineHeight: 1.35
rounded:
  control: "20rpx"
  surface: "24rpx"
  ticket: "28rpx"
spacing:
  xs: "8rpx"
  sm: "18rpx"
  md: "24rpx"
  lg: "32rpx"
  xl: "40rpx"
  section: "64rpx"
components:
  button-primary:
    backgroundColor: "{colors.forest-action}"
    textColor: "#FFFFFF"
    typography: "{typography.title}"
    rounded: "{rounded.surface}"
    height: "96rpx"
  button-secondary:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.carbon-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.surface}"
    height: "96rpx"
  ticket:
    backgroundColor: "{colors.paper-surface}"
    textColor: "{colors.carbon-ink}"
    rounded: "{rounded.ticket}"
    padding: "34rpx 30rpx"
---

# Design System: 简历优化助手

## Overview

**Creative North Star: "岗位方向票夹"**

界面把求职过程表达成一组可以逐张核对的纸质岗位票，而不是通用 AI 仪表盘。视觉气质克制、可信、带有轻微资料归档感；信息密度适合单手浏览，并让隐私、事实边界和阶段状态先于装饰出现。

纸张底色、碳黑文字、墨绿操作色和金色编号共同构成稳定识别。首页与岗位方向页采用票据形态，其他流程页保持同一排版与边界语法，不复制具体页面构图。

**Key Characteristics:**

- 温暖纸面与清晰墨色，不使用渐变或玻璃效果。
- 深绿只承担选择、确认和继续操作，金色只承担编号与阶段信号。
- 票据切口、虚线分隔和纵向流程形成可复用的岗位票语言。
- 固定底部操作区尊重手机安全区，触控目标保持充足高度。

## Colors

颜色以低饱和纸面中性色为底，墨绿负责可信操作，金色和红色仅用于有限的状态提示。

### Primary

- **森林操作绿：** 用于主要按钮、选中身份与可操作文字；在每屏中保持稀缺，避免整片铺色。
- **深林文字绿：** 用于绿色状态底上的信息层级和事实边界说明。

### Secondary

- **金色票号：** 用于编号、版本和阶段信号，不承担主要操作。
- **克制危险红：** 仅用于不可恢复操作和错误状态。

### Neutral

- **纸张画布：** 页面背景及票据切口外部底色。
- **票面白：** 卡片、票据和模式控件的承载面。
- **碳黑墨：** 标题、正文重点和强边框。
- **灰绿墨：** 说明文、元数据与次级状态。
- **纸面分隔线：** 边框、列表分隔和虚线切口。

**The Sparse Ink Rule.** 墨绿只出现在关键确认、选中态和少量链接上；其稀缺性用于建立操作层级。

## Typography

原生中文字体栈用于所有主要阅读内容，等宽字体只用于票号、阶段码和计数标签。层级依靠字号、字重和留白建立，不用全大写英文装饰正文。

### Hierarchy

- **Display：** 52rpx、紧凑行高，用于每页唯一主标题。
- **Title：** 34rpx 左右、较重字重，用于分区与票面标题。
- **Body：** 27–29rpx、宽松行高，用于隐私说明、边界和状态文本。
- **Label：** 23–25rpx 等宽字，用于编号、版本、额度与阶段码。

**The One Display Rule.** 每个页面只保留一个 52rpx 主标题，其余层级不得与它竞争。

## Layout

采用单列手机布局，页面水平内边距为 32rpx，顶部约 30–40rpx。主要内容按 24–34rpx 的紧凑节奏组织，分区之间扩大到约 56–64rpx。需要连续操作的页面使用固定底部操作区，并把页面底部留白增加到安全区以上。方向比较使用横向 `swiper` 露出下一张票的一小部分，其他页面不引入横向滚动。

## Elevation & Depth

系统不使用阴影。层次由纸面色差、2rpx 边框、虚线切口、留白和固定操作区的顶部分隔线建立。

**The Flat Paper Rule.** 所有静态表面保持平整；不得通过投影、发光或拟物浮雕制造虚假材质。

## Shapes

常规控件使用 20–24rpx 圆角，主要票据使用 28rpx 圆角。票据切口由画布色圆形缺口与虚线分隔组成，是本系统唯一的签名轮廓。边框统一使用 2rpx，危险操作允许使用偏红边框，但不改变圆角语言。

## Components

### Buttons

- **Primary：** 满宽或等比分栏，深绿底、白字、最小高度 96rpx、24rpx 圆角。
- **Secondary：** 票面白底配中性边框，保持同样高度与触控面积。
- **Danger：** 透明或纸面底配危险红文字与浅红边框，只用于不可恢复操作。
- **Disabled：** 灰纸底与低对比文字，不保留绿色暗示。

### Cards / Containers

- **Ticket：** 票面白、碳黑边框、28rpx 圆角，内部通常为 34rpx × 30rpx。
- **Status Banner：** 无边框、20rpx 圆角；成功或说明使用浅绿底，错误使用浅红底。
- **Empty State：** 浅票面底、虚线中性边框，文案居中且不过度装饰。

### Signature Component: 岗位方向票

岗位方向票由等宽票号、单一方向标题、事实证据字段和虚线分隔组成。多方向比较时通过横向滑动切换，一次只让一张票成为阅读焦点，并露出下一张提示可滑动。

## Do's and Don'ts

### Do:

- **Do** 先显示身份、额度、隐私或事实边界，再进入生成操作。
- **Do** 用编号、列表和票据字段组织复杂求职流程。
- **Do** 让主要触控目标至少达到 88–96rpx 高，并为底部安全区留白。
- **Do** 把尚未实现或尚未分析的数据明确标为等待状态。

### Don't:

- **Don't** 使用桌面仪表盘式多栏布局、密集侧边栏或网页比例卡片网格。
- **Don't** 使用渐变、玻璃效果、硬投影、发光或装饰性图标替代清晰文字。
- **Don't** 把推断、示例数据或未来阶段功能伪装成用户的真实经历。
- **Don't** 在同一屏重复多个主要绿色操作按钮。
