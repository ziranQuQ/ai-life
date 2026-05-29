const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8000);
const ROOT_DIR = __dirname;

loadEnvFile();

const DEEPSEEK_API_KEY = cleanEnvValue(process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEKAPIKEY);
const DEEPSEEK_MODEL = normalizeDeepSeekModel(process.env.DEEPSEEK_MODEL || process.env.DEEPSEEKMODEL);
const DEFAULT_STORY = "高考结束了，你站在人生的第一个重要路口。未来会怎样，还没有答案。";
const TURNS_PER_STAGE = 9;
const CHOICE_COUNT = 4;
const LIFE_DOMAINS = ["生计", "家庭", "关系", "健康", "居住", "自我", "时代", "偶然", "日常"];
const ARC_TYPES = ["main", "side", "random"];
const ARC_STATUSES = ["none", "open", "closed", "promoted"];
const ARC_IMPACTS = ["none", "seed", "stateChange", "mainShift"];
const SIDE_ARC_IDEAS = [
  "兴趣爱好",
  "恋爱或亲密关系",
  "朋友与合伙",
  "一次搬迁或远行",
  "健康提醒",
  "照护家人",
  "重新学习一门技能",
  "社区或熟人网络",
  "旧人重逢",
  "一段短暂的孤独生活"
];
const RANDOM_EVENT_IDEAS = [
  "意外得到一笔钱",
  "遇到可行的商业机会",
  "被裁员或行业突然变化",
  "亲人突发健康问题",
  "房租或城市政策改变",
  "朋友提出合伙邀请",
  "一次偶然的作品被看见",
  "一场事故改变生活节奏"
];
const TIME_JUMP_EXAMPLES = [
  "几个星期后",
  "一个雨季过去",
  "半年后",
  "年关前",
  "又一个夏天",
  "一年多后",
  "两三年后",
  "换过几次住处后",
  "父母明显老了一些时",
  "身体第一次提醒你时",
  "城市换了一轮门面后",
  "许多旧人渐渐少联系后"
];
const LIFE_STATE_FIELDS = ["livelihood", "residence", "relationships", "family", "health", "money", "direction", "unresolved"];
const DEFAULT_LIFE_STATE = {
  livelihood: "尚未稳定",
  residence: "仍在原点附近",
  relationships: "关系尚未展开",
  family: "家庭期待仍在身后",
  health: "普通",
  money: "有限",
  direction: "刚站到人生起点",
  unresolved: ["高考之后的去向"]
};
const LIFE_STAGES = [
  {
    name: "高考之后",
    scope: "起点来自高考之后，但不要默认只能上大学。生活可能围绕家乡、家庭期待、继续读书、打工、离开或留下展开。",
    preferredDomains: ["家庭", "生计", "自我", "居住", "日常"],
    forbidden: "不要出现成熟职场权谋、中年家庭危机或复杂资产配置。"
  },
  {
    name: "初入社会",
    scope: "玩家开始自己承担生活成本。生活可能涉及房租、工资、老板、同事、通勤、城市适应、孤独和自尊。",
    preferredDomains: ["生计", "居住", "关系", "自我", "日常"],
    forbidden: "不要再把学校、图书馆、习题、考试作为主线，除非只是短暂回忆。"
  },
  {
    name: "立身之年",
    scope: "玩家逐渐建立生计、习惯、身份和关系。生活可能涉及技能、收入、住处、朋友圈、长期选择和自我位置。",
    preferredDomains: ["生计", "关系", "居住", "家庭", "自我", "日常"],
    forbidden: "不要回到学生刷题主线，不要写成校园学习日常。"
  },
  {
    name: "风向渐明",
    scope: "玩家的人生方向逐渐显出轮廓，但不要把阶段名当主题。生活可能涉及事业、关系、家庭、居住、健康习惯和自我追求。",
    preferredDomains: ["生计", "关系", "家庭", "健康", "自我", "日常"],
    forbidden: "不要让 NPC 抢走主角，不要把剧情写成校园或学术解题。"
  },
  {
    name: "不惑前后",
    scope: "玩家开始更清楚地看见一些选择的代价和边界。生活可能涉及家庭责任、关系变化、职业瓶颈、健康、旧人和未完成的事。",
    preferredDomains: ["家庭", "关系", "健康", "生计", "自我", "偶然"],
    forbidden: "不要写学校题目、专业公式、图书馆刷题或年轻学生语境。"
  },
  {
    name: "半生已过",
    scope: "过去的选择开始形成稳定形状。生活可能涉及资产、家庭结构、身体变化、关系距离、守成、转身或旧伏笔回响。",
    preferredDomains: ["健康", "家庭", "关系", "生计", "居住", "自我"],
    forbidden: "严禁继续写学校、习题集、图书馆、高等数学、积分题、符号体系、学术推导作为剧情。"
  },
  {
    name: "深水之中",
    scope: "玩家拥有了一些东西，也被一些东西固定。生活可能涉及位置、责任、名声、孤独、健康限制、守成或最后几次冒险。",
    preferredDomains: ["健康", "家庭", "关系", "自我", "生计", "日常"],
    forbidden: "不要出现年轻学生场景作为主线。"
  },
  {
    name: "晚景渐近",
    scope: "外部变数逐渐减少，回声变多。生活可能涉及旧物、身体、老友、家人、传承、执念、日常和最后的远行。",
    preferredDomains: ["健康", "关系", "家庭", "日常", "自我", "偶然"],
    forbidden: "不要统一写成安详，不要写年轻学生主线。"
  },
  {
    name: "人生终章",
    scope: "走马灯式总结，不评价，只回放。可以有克制的文学升华。",
    preferredDomains: ["自我", "关系", "家庭", "日常"],
    forbidden: "不要评分，不要判定成功失败。"
  }
];
const UNIVERSAL_FORBIDDEN_TOPICS = [
  "三重积分",
  "曲面积分",
  "换元",
  "柱面坐标",
  "球坐标",
  "参数化",
  "证明题",
  "符号体系",
  "习题集"
];
const GENERIC_CHOICES = new Set([
  "继续努力",
  "换个方向",
  "先观察情况",
  "主动尝试新机会",
  "先积累更多信息",
  "找信任的人商量"
]);
const MAX_AI_RETRIES = 2;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

function cleanEnvValue(value) {
  return String(value || "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function normalizeDeepSeekModel(value) {
  const model = cleanEnvValue(value).toLowerCase();

  if (model.includes("pro")) {
    return "deepseek-v4-pro";
  }

  if (model.includes("flash")) {
    return "deepseek-v4-flash";
  }

  return "deepseek-v4-flash";
}

function loadEnvFile() {
  const envFileNames = [".env", "666.env"];
  const envFileName = envFileNames.find(function (fileName) {
    return fs.existsSync(path.join(ROOT_DIR, fileName));
  });

  if (!envFileName) {
    return;
  }

  const envPath = path.join(ROOT_DIR, envFileName);
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  lines.forEach(function (line) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return;
    }

    const equalsIndex = trimmedLine.indexOf("=");

    if (equalsIndex === -1) {
      return;
    }

    const key = trimmedLine.slice(0, equalsIndex).trim();
    const value = trimmedLine.slice(equalsIndex + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", function (chunk) {
      body += chunk;

      if (body.length > 100000) {
        request.destroy();
        reject(new Error("请求内容太大"));
      }
    });

    request.on("end", function () {
      resolve(body);
    });

    request.on("error", reject);
  });
}

function getChoiceText(choice) {
  const choices = {
    university: "去上大学",
    work: "去工作",
    startup: "创业"
  };

  return choices[choice] || choice || "继续人生";
}

function extractDeepSeekContent(data) {
  if (!Array.isArray(data.choices) || !data.choices[0]) {
    return "";
  }

  return (data.choices[0].message && data.choices[0].message.content
    ? data.choices[0].message.content
    : ""
  ).trim();
}

function extractJsonText(content) {
  const trimmedContent = content.trim();
  const codeBlockMatch = trimmedContent.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  const firstBrace = trimmedContent.indexOf("{");
  const lastBrace = trimmedContent.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmedContent.slice(firstBrace, lastBrace + 1);
  }

  return trimmedContent;
}

function repairLooseJson(jsonText) {
  return jsonText
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
}

function parseLooseStoryResult(content) {
  const jsonText = repairLooseJson(extractJsonText(content));
  const storyMatch = jsonText.match(/"story"\s*:\s*"([\s\S]*?)"\s*,\s*"choices"/);
  const choicesMatch = jsonText.match(/"choices"\s*:\s*\[([\s\S]*?)\]\s*}/);

  if (!storyMatch || !choicesMatch) {
    return null;
  }

  const story = storyMatch[1].trim();
  const choices = [];
  const choicePattern = /"([\s\S]*?)"(?:\s*,|\s*$)|"([\s\S]*?)\s*$/g;
  let match;

  while ((match = choicePattern.exec(choicesMatch[1])) !== null) {
    choices.push(normalizeChoiceText(match[1] || match[2]));
  }

  if (story && choices.length >= CHOICE_COUNT && !hasGenericChoices(choices.slice(0, CHOICE_COUNT))) {
    return normalizeStoryResult({
      story,
      choices: choices.slice(0, CHOICE_COUNT),
      source: "ai"
    });
  }

  return null;
}

function buildFallbackChoices(story) {
  if (story.includes("游戏") || story.includes("英雄联盟") || story.includes("开黑") || story.includes("队友")) {
    return ["把娱乐时间压到晚上", "约朋友线下见一面", "把注意力拉回现实", "暂时放空一天"];
  }

  if (story.includes("大学") || story.includes("课程") || story.includes("校园") || story.includes("同学")) {
    return ["继续读下去并争取奖学金", "参加社团认识新的人", "寻找兼职补贴生活", "考虑毕业后的城市"];
  }

  if (story.includes("工作") || story.includes("公司") || story.includes("同事") || story.includes("老板")) {
    return ["把这份工作先做稳", "争取接触新的岗位", "下班发展另一个可能", "重新评估这座城市"];
  }

  if (story.includes("创业") || story.includes("客户") || story.includes("项目") || story.includes("产品")) {
    return ["继续扩大眼前的生意", "试着开辟新的收入来源", "找一个可信的人合作", "给生活留出一点空地"];
  }

  if (story.includes("家庭") || story.includes("父母") || story.includes("家人")) {
    return ["和家人重新谈一次边界", "独自承担这个决定", "把更多精力转向自己的生活", "暂时维持表面的平静"];
  }

  if (story.includes("钱") || story.includes("收入") || story.includes("存款") || story.includes("经济")) {
    return ["提高收入优先级", "控制开销保住余地", "寻找新的机会", "接受一段更普通的生活"];
  }

  return ["把眼前生活先稳定下来", "主动离开原来的圈子", "联系一个新的关键人物", "给自己留一条退路"];
}

function normalizeChoiceText(choice) {
  return choice
    .replace(/^(?:选项)?[ABCD]\s*[：:、.]?\s*/i, "")
    .replace(/^[1234]\s*[：:、.]?\s*/, "")
    .trim()
    .slice(0, 30);
}

function hasGenericChoices(choices) {
  return choices.some(function (choice) {
    return GENERIC_CHOICES.has(choice);
  });
}

function parseLineFormat(content) {
  const lines = content
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(Boolean);

  let story = "";
  const choices = [];

  lines.forEach(function (line) {
    const storyMatch = line.match(/^剧情[：:]\s*(.+)$/);
    const choiceMatch = line.match(/^(?:选项)?([ABCD])\s*[：:、.]\s*(.+)$/i);
    const numberedMatch = line.match(/^[1234]\s*[：:、.]\s*(.+)$/);

    if (storyMatch) {
      story = storyMatch[1].trim();
    } else if (choiceMatch) {
      choices.push(choiceMatch[2].trim().slice(0, 20));
    } else if (numberedMatch) {
      choices.push(numberedMatch[1].trim().slice(0, 20));
    }
  });

  if (!story) {
    const firstChoiceIndex = lines.findIndex(function (line) {
      return /^(?:选项)?[ABCD]\s*[：:、.]|^[1234]\s*[：:、.]/i.test(line);
    });

    if (firstChoiceIndex > 0) {
      story = lines.slice(0, firstChoiceIndex).join("");
    }
  }

  if (story && choices.length >= CHOICE_COUNT) {
    return {
      story,
      choices: choices.slice(0, CHOICE_COUNT),
      source: "ai"
    };
  }

  return null;
}

function parseStoryResult(content) {
  const jsonText = extractJsonText(content);
  const lineResult = parseLineFormat(content);

  if (lineResult) {
    return sanitizeStoryResult(normalizeStoryResult(lineResult));
  }

  const fallbackResult = {
    story: content,
    choices: buildFallbackChoices(content),
    source: "fallback"
  };

  try {
    const parsedResult = parseJsonStoryResult(jsonText, fallbackResult);
    return sanitizeStoryResult(parsedResult);
  } catch (error) {
    const looseResult = parseLooseStoryResult(content);

    if (looseResult) {
      return sanitizeStoryResult(looseResult);
    }

    return sanitizeStoryResult(normalizeStoryResult(fallbackResult));
  }
}

function parseJsonStoryResult(jsonText, fallbackResult) {
  let result;

  try {
    result = JSON.parse(jsonText);
  } catch (error) {
    result = JSON.parse(repairLooseJson(jsonText));
  }

  const story = typeof result.story === "string"
    ? result.story.trim()
    : typeof result["剧情"] === "string"
      ? result["剧情"].trim()
      : "";
  const rawChoices = Array.isArray(result.choices)
    ? result.choices
    : Array.isArray(result.options)
      ? result.options
      : Array.isArray(result["选项"])
        ? result["选项"]
        : [];
  const choices = rawChoices
    .filter(function (choice) {
      return typeof choice === "string" && choice.trim();
    })
    .map(function (choice) {
      return normalizeChoiceText(choice);
    })
    .filter(Boolean)
    .slice(0, CHOICE_COUNT);

  if (!story || choices.length !== CHOICE_COUNT || hasGenericChoices(choices)) {
    return normalizeStoryResult({
      story: story || fallbackResult.story,
      choices: buildFallbackChoices(story || fallbackResult.story),
      source: "fallback"
    });
  }

  return normalizeStoryResult({ ...result, story, choices, source: "ai" });
}

function normalizeTimeJump(timeJump) {
  const text = typeof timeJump === "string" ? timeJump.trim() : "";

  return text.slice(0, 20) || "一段时间后";
}

function buildTimeJumpGuidance(lifeLog) {
  const recentTimeJumps = Array.isArray(lifeLog)
    ? lifeLog.slice(-6).map(function (item) {
      return item.timeJump;
    }).filter(Boolean)
    : [];
  const recentSummary = recentTimeJumps.length ? recentTimeJumps.join("、") : "暂无";

  return [
    `最近用过的时间跨度：${recentSummary}`,
    `本次请优先从这些表达中选择一个没有刚刚重复过的：${TIME_JUMP_EXAMPLES.join("、")}。`,
    "不要连续使用“几个月后”。时间跨度应随人生阶段自然变长或变短。"
  ].join("\n");
}

function normalizeStatePatch(statePatch) {
  if (!statePatch || typeof statePatch !== "object" || Array.isArray(statePatch)) {
    return {};
  }

  return LIFE_STATE_FIELDS.reduce(function (patch, fieldName) {
    const value = statePatch[fieldName];

    if (Array.isArray(value)) {
      const normalizedList = normalizeStringList(value, 8, 36);

      if (normalizedList.length) {
        patch[fieldName] = normalizedList;
      }

      return patch;
    }

    if (typeof value === "string" && value.trim()) {
      patch[fieldName] = value.trim().slice(0, 40);
    }

    return patch;
  }, {});
}

function normalizeArcType(arcType) {
  return ARC_TYPES.includes(arcType) ? arcType : "main";
}

function normalizeArcStatus(arcStatus) {
  return ARC_STATUSES.includes(arcStatus) ? arcStatus : "none";
}

function normalizeArcImpact(arcImpact) {
  return ARC_IMPACTS.includes(arcImpact) ? arcImpact : "none";
}

function normalizeStoryResult(result) {
  const stageIndex = Number.isInteger(result.stageIndex) ? result.stageIndex : undefined;

  return {
    story: String(result.story || "").trim(),
    choices: Array.isArray(result.choices) ? result.choices.slice(0, CHOICE_COUNT) : buildFallbackChoices(result.story || ""),
    timeJump: normalizeTimeJump(result.timeJump),
    choiceType: normalizeChoiceType(result.choiceType),
    lifeDomain: normalizeLifeDomain(result.lifeDomain),
    arcType: normalizeArcType(result.arcType),
    arcName: typeof result.arcName === "string" ? result.arcName.trim().slice(0, 24) : "",
    arcStatus: normalizeArcStatus(result.arcStatus),
    arcImpact: normalizeArcImpact(result.arcImpact),
    statePatch: normalizeStatePatch(result.statePatch),
    seeds: normalizeStringList(result.seeds, 4, 36),
    tendencies: normalizeStringList(result.tendencies, 4, 18),
    reflection: typeof result.reflection === "string" ? result.reflection.trim().slice(0, 220) : "",
    stage: typeof result.stage === "string" ? result.stage.trim().slice(0, 12) : undefined,
    stageIndex,
    source: result.source || "ai"
  };
}

function sanitizeStoryResult(result) {
  const story = String(result.story || "");
  const hasForbiddenTopic = UNIVERSAL_FORBIDDEN_TOPICS.some(function (topic) {
    return story.includes(topic);
  });

  if (!hasForbiddenTopic) {
    return result;
  }

  return {
    ...result,
    story: "这一段日子没有发生戏剧性的转折。你处理着眼前的生活、关系和责任，也在一些普通决定里慢慢改变自己的方向。",
    choices: ["把眼前的事先处理清楚", "给一个重要的人回消息", "让自己休息一个晚上"],
    timeJump: "一段时间后",
    choiceType: "flavor",
    lifeDomain: "日常",
    arcType: "main",
    arcName: "",
    arcStatus: "none",
    arcImpact: "none",
    statePatch: {},
    source: "fallback"
  };
}

function normalizeChoiceType(choiceType) {
  const allowedTypes = new Set(["major", "minor", "flavor"]);

  return allowedTypes.has(choiceType) ? choiceType : "minor";
}

function normalizeLifeDomain(lifeDomain) {
  return LIFE_DOMAINS.includes(lifeDomain) ? lifeDomain : "日常";
}

function normalizeStringList(items, maxCount, maxLength) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .filter(function (item) {
      return typeof item === "string" && item.trim();
    })
    .map(function (item) {
      return item.trim().slice(0, maxLength);
    })
    .slice(0, maxCount);
}

function normalizeLifeState(lifeState) {
  const source = lifeState && typeof lifeState === "object" && !Array.isArray(lifeState)
    ? lifeState
    : {};

  return {
    livelihood: normalizeStateValue(source.livelihood, DEFAULT_LIFE_STATE.livelihood),
    residence: normalizeStateValue(source.residence, DEFAULT_LIFE_STATE.residence),
    relationships: normalizeStateValue(source.relationships, DEFAULT_LIFE_STATE.relationships),
    family: normalizeStateValue(source.family, DEFAULT_LIFE_STATE.family),
    health: normalizeStateValue(source.health, DEFAULT_LIFE_STATE.health),
    money: normalizeStateValue(source.money, DEFAULT_LIFE_STATE.money),
    direction: normalizeStateValue(source.direction, DEFAULT_LIFE_STATE.direction),
    unresolved: normalizeStringList(source.unresolved, 8, 36).length
      ? normalizeStringList(source.unresolved, 8, 36)
      : DEFAULT_LIFE_STATE.unresolved
  };
}

function normalizeStateValue(value, fallback) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 40)
    : fallback;
}

function formatLifeState(lifeState) {
  const state = normalizeLifeState(lifeState);

  return [
    `谋生：${state.livelihood}`,
    `居住：${state.residence}`,
    `关系：${state.relationships}`,
    `家庭：${state.family}`,
    `健康：${state.health}`,
    `金钱：${state.money}`,
    `方向：${state.direction}`,
    `未了之事：${state.unresolved.length ? state.unresolved.join("；") : "暂无"}`
  ].join("\n");
}

function normalizeGameState(gameState, playerName) {
  if (!gameState || typeof gameState !== "object") {
    return {
      name: playerName,
      stageIndex: 0,
      stage: LIFE_STAGES[0].name,
      turn: 0,
      seeds: [],
      tendencies: [],
      lifeState: normalizeLifeState(),
      activeArcs: [],
      lifeLog: []
    };
  }

  const stageIndex = Number.isInteger(gameState.stageIndex)
    ? Math.min(Math.max(gameState.stageIndex, 0), LIFE_STAGES.length - 1)
    : 0;

  return {
    name: playerName,
    stageIndex,
    stage: LIFE_STAGES[stageIndex].name,
    turn: Number.isInteger(gameState.turn) ? Math.max(gameState.turn, 0) : 0,
    seeds: normalizeStringList(gameState.seeds, 12, 36),
    tendencies: normalizeStringList(gameState.tendencies, 8, 18),
    lifeState: normalizeLifeState(gameState.lifeState),
    activeArcs: normalizeActiveArcs(gameState.activeArcs),
    lifeLog: Array.isArray(gameState.lifeLog) ? gameState.lifeLog.slice(-8) : []
  };
}

function normalizeActiveArcs(activeArcs) {
  if (!Array.isArray(activeArcs)) {
    return [];
  }

  return activeArcs.filter(function (arc) {
    return arc && typeof arc === "object";
  }).map(function (arc) {
    return {
      name: typeof arc.name === "string" ? arc.name.trim().slice(0, 24) : "",
      type: normalizeArcType(arc.type),
      status: normalizeArcStatus(arc.status),
      impact: normalizeArcImpact(arc.impact),
      note: typeof arc.note === "string" ? arc.note.trim().slice(0, 60) : ""
    };
  }).filter(function (arc) {
    return arc.name && arc.status !== "closed";
  }).slice(-8);
}

function formatRecentLifeLog(lifeLog) {
  if (!Array.isArray(lifeLog) || lifeLog.length === 0) {
    return "暂无";
  }

  return lifeLog.slice(-5).map(function (item) {
    const domain = item.lifeDomain ? `（${item.lifeDomain}）` : "";
    const arc = item.arcName ? `，支线/事件：${item.arcName}` : "";
    return `${item.stage || "某阶段"}${domain}选择了「${item.choice || "未知选择"}」${arc}`;
  }).join("；");
}

function formatActiveArcs(activeArcs) {
  if (!Array.isArray(activeArcs) || activeArcs.length === 0) {
    return "暂无";
  }

  return activeArcs.slice(-6).map(function (arc) {
    return `${arc.name || "未命名"}（${arc.type || "side"}，${arc.status || "open"}，${arc.impact || "seed"}）`;
  }).join("；");
}

function buildArcGuidance(gameState) {
  const recentArcTypes = Array.isArray(gameState.lifeLog)
    ? gameState.lifeLog.slice(-6).map(function (item) {
      return item.arcType;
    }).filter(Boolean)
    : [];
  const mainCount = recentArcTypes.filter(function (type) {
    return type === "main";
  }).length;
  const sideCount = recentArcTypes.filter(function (type) {
    return type === "side";
  }).length;
  const randomCount = recentArcTypes.filter(function (type) {
    return type === "random";
  }).length;

  if (mainCount >= 5) {
    return [
      "最近主线过多，本次优先生成一条支线，但支线必须仍然属于玩家人生：兴趣、恋爱、朋友、健康、搬迁、学习或远行。",
      `可选支线灵感：${SIDE_ARC_IDEAS.join("、")}。`,
      "支线可以轻轻经过，也可以留下伏笔；只有当玩家选择明显投入时，才允许升级为谋生或人生主线。"
    ].join("\n");
  }

  if (sideCount >= 3) {
    return "最近支线较多，本次应回到人生主线，展示谋生、家庭、健康、金钱、居住或长期方向的变化。";
  }

  if (randomCount === 0 && gameState.turn > 0 && gameState.turn % 7 === 0) {
    return [
      "本次可以考虑一个稀有随机事件，但不要像抽卡爽文。",
      `可选随机事件灵感：${RANDOM_EVENT_IDEAS.join("、")}。`,
      "随机事件必须带来诱惑和代价，让玩家决定是否投入，而不是直接替玩家改变人生。"
    ].join("\n");
  }

  return [
    "本次默认推进主线，但可以自然打开一个支线入口。",
    `支线灵感：${SIDE_ARC_IDEAS.join("、")}。`,
    "随机事件必须稀有，且不能直接奖励或惩罚玩家。"
  ].join("\n");
}

function getRecentDomainGuidance(lifeLog, currentStage) {
  const recentDomains = Array.isArray(lifeLog)
    ? lifeLog.slice(-5).map(function (item) {
      return item.lifeDomain;
    }).filter(function (domain) {
      return LIFE_DOMAINS.includes(domain);
    })
    : [];
  const domainCounts = recentDomains.reduce(function (counts, domain) {
    counts[domain] = (counts[domain] || 0) + 1;
    return counts;
  }, {});
  const repeatedDomain = LIFE_DOMAINS.find(function (domain) {
    return domainCounts[domain] >= 3;
  });
  const preferredDomains = Array.isArray(currentStage.preferredDomains)
    ? currentStage.preferredDomains.join("、")
    : LIFE_DOMAINS.join("、");

  if (repeatedDomain) {
    const alternatives = LIFE_DOMAINS.filter(function (domain) {
      return domain !== repeatedDomain;
    }).join("、");

    return `最近「${repeatedDomain}」出现过多。本次除非玩家刚刚的选择强烈要求，否则请避开「${repeatedDomain}」，优先转向：${alternatives}。`;
  }

  return `本阶段可优先考虑这些生活领域：${preferredDomains}。也可以根据上一幕自然转向其他领域。`;
}

function detectNarrativeTrap(gameState) {
  const text = [
    gameState.lifeState && gameState.lifeState.livelihood,
    gameState.lifeState && gameState.lifeState.relationships,
    gameState.lifeState && gameState.lifeState.family,
    gameState.lifeState && gameState.lifeState.direction,
    Array.isArray(gameState.lifeState && gameState.lifeState.unresolved)
      ? gameState.lifeState.unresolved.join("；")
      : "",
    Array.isArray(gameState.lifeLog)
      ? gameState.lifeLog.slice(-6).map(function (item) {
        return [item.choice, item.result].join(" ");
      }).join(" ")
      : ""
  ].join(" ");
  const traps = [
    {
      label: "店铺/小生意",
      patterns: ["店", "铺", "摊", "货", "客人", "生意"]
    },
    {
      label: "父亲/家庭单线",
      patterns: ["父亲", "爸爸", "爸"]
    },
    {
      label: "学校/刷题",
      patterns: ["学校", "图书馆", "习题", "考试"]
    },
    {
      label: "汽修/单一职业",
      patterns: ["汽修", "修车", "工位", "汽配"]
    }
  ];
  const matchedTraps = traps.filter(function (trap) {
    return trap.patterns.some(function (pattern) {
      return text.includes(pattern);
    });
  }).map(function (trap) {
    return trap.label;
  });

  if (!matchedTraps.length) {
    return "暂无明显单线陷阱。";
  }

  return [
    `检测到剧情可能被这些内容锁住：${matchedTraps.join("、")}。`,
    "本次必须把它们降为背景或人生履历的一部分，不要继续围绕它们展开主线。",
    "请引入至少两个新的生活面向，例如新的城市/住处、伴侣或朋友、健康问题、行业变化、债务/资产、子女或照护、学习转行、远行、政策或时代变化。"
  ].join("\n");
}

async function handleStoryRequest(request, response) {
  if (!DEEPSEEK_API_KEY) {
    sendJson(response, 500, {
      error: "还没有设置 DeepSeek API Key。请检查环境变量 DEEPSEEK_API_KEY 或 DEEPSEEKAPIKEY。"
    });
    return;
  }

  try {
    const rawBody = await readRequestBody(request);
    const body = JSON.parse(rawBody || "{}");

    const playerName = String(body.name || "玩家").slice(0, 30);
    const choiceText = getChoiceText(body.choice);
    const previousStory = String(body.previousStory || DEFAULT_STORY).slice(0, 1000);
    const gameState = normalizeGameState(body.gameState, playerName);
    const currentStage = LIFE_STAGES[gameState.stageIndex] || LIFE_STAGES[0];
    const shouldAdvanceStage = gameState.turn > 0 && gameState.turn % TURNS_PER_STAGE === 0 && gameState.stageIndex < LIFE_STAGES.length - 2;

    const prompt = buildStoryPrompt({
      playerName,
      choiceText,
      previousStory,
      gameState,
      currentStage,
      shouldAdvanceStage
    });

    const data = await requestStoryFromAI(prompt, shouldAdvanceStage);
    const content = extractDeepSeekContent(data);
    const result = parseStoryResult(content);

    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "服务器出错了" });
  }
}

function buildStoryPrompt(context) {
  const playerName = context.playerName;
  const choiceText = context.choiceText;
  const previousStory = context.previousStory;
  const gameState = context.gameState;
  const currentStage = context.currentStage;
  const shouldAdvanceStage = context.shouldAdvanceStage;
  const nextStage = LIFE_STAGES[gameState.stageIndex + 1] || currentStage;
  const currentStageIndex = shouldAdvanceStage ? gameState.stageIndex + 1 : gameState.stageIndex;
  const outputStage = shouldAdvanceStage ? nextStage.name : currentStage.name;
  const domainGuidance = getRecentDomainGuidance(gameState.lifeLog, currentStage);
  const timeJumpGuidance = buildTimeJumpGuidance(gameState.lifeLog);
  const narrativeTrapGuidance = detectNarrativeTrap(gameState);
  const arcGuidance = buildArcGuidance(gameState);

  return [
      "你正在为一个《AI人生模拟器》网页游戏生成下一幕。",
      "",
      "【玩家资料】",
      `姓名：${playerName}`,
      `当前阶段：${currentStage.name}`,
      `阶段气氛：${currentStage.scope}`,
      `阶段禁区：${currentStage.forbidden}`,
      `已经经历的选择次数：${gameState.turn}`,
      "",
      "【上一人生节点】",
      previousStory,
      "",
      "【玩家刚刚点击的选择】",
      choiceText,
      "",
      "【人生档案】",
      formatLifeState(gameState.lifeState),
      `人生种子：${gameState.seeds.length ? gameState.seeds.join("；") : "暂无"}`,
      `人生倾向：${gameState.tendencies.length ? gameState.tendencies.join("；") : "暂无"}`,
      `正在发展的支线：${formatActiveArcs(gameState.activeArcs)}`,
      `最近选择：${formatRecentLifeLog(gameState.lifeLog)}`,
      `生活领域轮换：${domainGuidance}`,
      `时间跨度建议：${timeJumpGuidance}`,
      `单线陷阱提醒：${narrativeTrapGuidance}`,
      `支线与随机事件建议：${arcGuidance}`,
      "",
      "【生成目标】",
      "1. 这是人生模拟器，不是单个事件模拟器。每次点击后必须推进一段人生时间，而不是继续描写上一幕的下一秒。",
      "2. 上一人生节点只能用来提取长期影响，不要续写搬东西、认门、做题、修车、聊天等具体动作。",
      "3. 剧情必须呈现“选择之后，过了一段时间，人生状态如何变化，并来到新的节点”。",
      "4. timeJump 必须写清时间跨度，但不要总写“几个月后”。优先使用更有生活感的时间表达，例如雨季过去、年关前、又一个夏天、两三年后、父母明显老了一些时。",
      "5. 选项必须是下一段人生的处理方式或方向，不要写成弯腰搬沙发、上楼看屋、拿起工具这种微动作。",
      "6. 阶段名只代表时间气氛，不是剧情主题。不要把阶段名硬套成单一欲望、单一职业或单一关系。",
      "7. 剧情必须是现实人生模拟：学业、工作、家庭、金钱、关系、健康、城市生活、机会与压力。",
      "8. 当前人生不能只剩一个店、一个职业、一个父亲或一个 NPC。每一幕都要让玩家感到人生结构在扩大或改变。",
      "9. 至少让剧情同时涉及两个生活面向，例如谋生+亲密关系、家庭+健康、金钱+居住、职业+时代变化、自我追求+朋友疏远。",
      "10. 不是每个选择都要站在人生岔路口。允许出现一个生活化、看似无关紧要的选项，它可能没有长期后果。",
      "11. 玩家不知道哪个选择会成为伏笔。不要显式标注选项重要程度。",
      "12. 可以出现支线：兴趣爱好、恋爱、朋友、健康、搬迁、远行、学习、社区、旧人重逢。支线通常持续 1 到 3 个节点，然后回到主线。",
      "13. 支线可以升级为主线：例如兴趣变成谋生、恋爱变成家庭、朋友变成合伙人、一次远行改变居住地。但只有玩家选择明显投入时才允许升级。",
      "14. 可以出现随机事件，但必须稀有。彩票中奖、商业机会、裁员、疾病、政策变化等都要带有代价和不确定性，不要直接给玩家开挂。",
      "15. NPC 可以出现，但必须服务于玩家个人主线，不要抢走主角位置。不要只有父亲或单个熟人反复出现。",
      "16. 不要评价玩家选择好坏，不要给分，不要使用成功、失败、正确、错误等评判词。",
      "17. 剧情 110 到 190 个中文字符，具体、有画面、有因果，但核心是人生节点，不是日记流水账。",
      "18. 四个选项必须符合当前人生节点：至少一个维持当前路线，至少一个转向新生活领域，至少一个关系/家庭/健康方向，至少一个看似普通或保守的选择。",
      "19. 如果本次是支线，四个选项里必须至少一个能回到主线；如果本次是随机事件，四个选项里必须至少一个拒绝冒险、一个谨慎尝试、一个全力投入。",
      "20. 禁止使用泛泛选项：继续努力、换个方向、先观察情况、主动尝试新机会、先积累更多信息、找信任的人商量。",
      "21. 面向普通大众玩家，文字要通俗、具体、可共情。严禁写高等数学、学术论文、专业公式、复杂理论、符号推导、曲面积分、三重积分等小众专业内容。",
      "22. 如果当前阶段已经不是人生初章，不要把学校、图书馆、刷题、考试、习题集作为主线。可以短暂回忆，但必须立刻回到当前阶段的现实处境。",
      `23. 本次必须从这些生活领域里选择一个作为隐藏分类：${LIFE_DOMAINS.join("、")}。如果最近几幕都困在同一行业、同一地点、同一 NPC 或同一任务，请自然转向其他生活领域。`,
      shouldAdvanceStage
        ? `24. 本次需要生成一个阶段回响 reflection，并自然进入下一阶段：${nextStage.name}。阶段回响中性总结这一阶段发生了什么、得到与失去、留下的碎片，不评分。`
        : "24. 本次不需要阶段回响，reflection 返回空字符串。",
      "",
      "【输出格式】",
      "只返回合法 JSON，不要 Markdown，不要代码块，不要额外解释。",
      "JSON 必须包含 story、choices、timeJump、choiceType、lifeDomain、arcType、arcName、arcStatus、arcImpact、statePatch、seeds、tendencies、reflection、stage、stageIndex：",
      "{\"story\":\"剧情文字\",\"choices\":[\"接下来一段人生的选择A\",\"接下来一段人生的选择B\",\"接下来一段人生的选择C\",\"接下来一段人生的选择D\"],\"timeJump\":\"又一个夏天\",\"choiceType\":\"minor\",\"lifeDomain\":\"生计\",\"arcType\":\"side\",\"arcName\":\"夜校摄影\",\"arcStatus\":\"open\",\"arcImpact\":\"seed\",\"statePatch\":{\"livelihood\":\"开始做稳定工作\",\"money\":\"略有积蓄\",\"direction\":\"暂时选择安稳\"},\"seeds\":[\"可能回响的生活种子\"],\"tendencies\":[\"自由\"],\"reflection\":\"\",\"stage\":\"高考之后\",\"stageIndex\":0}",
      "",
      "【字段说明】",
      "timeJump 是从玩家刚刚选择到这一幕之间经过的时间，必须体现人生推进。",
      "choiceType 只能是 major、minor、flavor 之一，代表刚才选择造成的影响级别，但不要在选项文字中体现。",
      `lifeDomain 只能是以下之一：${LIFE_DOMAINS.join("、")}。这是隐藏字段，不要写进剧情或选项。`,
      "arcType 只能是 main、side、random。main 是人生主线，side 是支线，random 是随机事件。",
      "arcName 是支线或随机事件名称，例如夜校摄影、旧友重逢、彩票奖金、合伙邀请；主线可为空字符串。",
      "arcStatus 只能是 none、open、closed、promoted。promoted 表示支线升级成主线。",
      "arcImpact 只能是 none、seed、stateChange、mainShift。mainShift 必须非常少见。",
      "statePatch 只写这次选择后发生变化的人生状态，可包含 livelihood、residence、relationships、family、health、money、direction、unresolved。没有变化的字段不要写。",
      "seeds 记录可能在未来回响的微小选择或生活碎片，可以为空数组。",
      "tendencies 记录玩家正在靠近的价值倾向，例如自由、安稳、家庭、理想、财富、权力、亲密、孤独，可以为空数组。",
      `stage 当前应为 ${outputStage}。`,
      `stageIndex 当前应为 ${currentStageIndex}。`
    ].join("\n");
}

async function requestStoryFromAI(prompt, shouldAdvanceStage) {
  let lastErrorMessage = "AI 生成失败";

  for (let attempt = 1; attempt <= MAX_AI_RETRIES; attempt += 1) {
    const compactInstruction = attempt > 1
      ? "\n\n【重试要求】上一次输出过长。请严格缩短：story 不超过 90 个中文字符，reflection 不超过 80 个中文字符，choices 每项不超过 16 个中文字符。"
      : "";
    const apiResponse = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: "system",
            content: [
              "你是严肃现实向的人生模拟器编剧。",
              "你的任务是根据人生档案和玩家选择，生成下一个人生节点。",
              "每次生成都必须推进一段人生时间，呈现长期状态变化；不要续写上一事件的下一秒。",
              "上一幕只用于提取长期影响，不用于连续描写同一个事件。",
              "人生不能被单个店铺、单个职业、单个父亲或单个 NPC 锁死；要持续扩展生活场域和人际网络。",
              "永远保持现实主义，不跑题，不把无关娱乐内容变成主线。",
              "阶段名只是时间气氛，不是剧情模板；不要围绕同一个职业、学校、NPC、地点或任务连续打转。",
              "你需要在生计、家庭、关系、健康、居住、自我、时代、偶然、日常之间自然轮换生活领域。",
              "你写给普通大众玩家，不写小众专业题材、高等数学、学术推导或晦涩理论。",
              "人生阶段必须随时间推进；后期阶段不能继续停留在学校刷题或校园主线。",
              "你必须只输出合法 JSON。"
            ].join("\n")
          },
          {
            role: "user",
            content: prompt + compactInstruction
          }
        ],
        max_tokens: shouldAdvanceStage ? 900 : 780,
        temperature: 0.82,
        response_format: {
          type: "json_object"
        }
      })
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      throw new Error(data.error && data.error.message ? data.error.message : "AI 生成失败");
    }

    if (data.choices && data.choices[0] && data.choices[0].finish_reason === "length") {
      lastErrorMessage = "AI 输出被截断了";
      continue;
    }

    return data;
  }

  throw new Error(lastErrorMessage + "，请再点一次选择。");
}

function serveStaticFile(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.resolve(ROOT_DIR, "." + requestedPath);
  const relativePath = path.relative(ROOT_DIR, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, function (error, data) {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(data);
  });
}

const server = http.createServer(function (request, response) {
  if (request.method === "GET" && request.url === "/api/debug-parse") {
    sendJson(response, 200, parseStoryResult("{ \"story\": \"第二天你去了城西的批发市场，找到一家卖散装饮料的仓库，价格比老刘那边低三成。老板是个秃顶男人，拍着胸脯说“都是正厂尾货，喝不死人”。你提了两箱回去，开瓶一尝，甜味淡了不少，气泡也软绵绵的。\", \"choices\": [ \"先将就卖着，反正便宜，薄利多销\", \"再找找其他批发商，看有没有质量稍好但价格适中的\", \"去找老刘，问能不能降点价拿原来那种\" ], \"choiceType\": \"minor\", \"seeds\": [\"散装饮料质量差\"], \"tendencies\": [\"自由\"], \"reflection\": \"\", \"stage\": \"人生初章\", \"stageIndex\": 0 }"));
    return;
  }

  if (request.method === "POST" && request.url === "/api/story") {
    handleStoryRequest(request, response);
    return;
  }

  if (request.method === "GET") {
    serveStaticFile(request, response);
    return;
  }

  response.writeHead(405);
  response.end("Method not allowed");
});

server.listen(PORT, function () {
  console.log(`AI人生模拟器已启动：http://localhost:${PORT}`);
});
