import { createStagePage } from "../../utils/create-stage-page";

createStagePage({
  title: "补充关键事实",
  description: "只有影响岗位判断的事实缺口才会提问，最多五题，每题都可以跳过。",
  phase: "P4",
  status: "尚未启用",
  items: [
    { name: "问题来源", status: "简历事实缺口" },
    { name: "问题上限", status: "最多 5 题" },
    { name: "回答方式", status: "可回答或跳过" },
  ],
  primaryLabel: "P4 开放补充",
});
