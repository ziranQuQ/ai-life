const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8000);
const ROOT_DIR = __dirname;

loadEnvFile();

const DEEPSEEK_API_KEY = cleanEnvValue(process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEKAPIKEY);
const DEEPSEEK_MODEL = normalizeDeepSeekModel(process.env.DEEPSEEK_MODEL || process.env.DEEPSEEKMODEL);
const DEFAULT_STORY = "高考结束了，你站在人生的第一个重要路口。未来会怎样，还没有答案。";
const LIFE_STAGES = [
  {
    name: "人生初章",
    theme: "离开原点，第一次面对选择。围绕家庭、教育、家乡、第一份工作、有限认知与不确定。"
  },
  {
    name: "独立谋生",
    theme: "自己承担生活，现实开始有重量。围绕房租、工资、技能、老板、同事、通勤、城市与自尊。"
  },
  {
    name: "欲望成形",
    theme: "玩家开始靠近自己真正想要的东西。围绕野心、爱情、自由、金钱、稳定、身份与理想。"
  },
  {
    name: "关系交错",
    theme: "他人的期待、陪伴、亏欠与分离进入人生。NPC 可以出现，但必须服务于玩家主线。"
  },
  {
    name: "代价显现",
    theme: "早年选择开始以不同形式回响。围绕健康、债务、机会成本、关系裂缝、职业瓶颈和旧伏笔。"
  },
  {
    name: "深水区",
    theme: "玩家拥有了一些东西，也被一些东西固定。选择更少，但每一步更重。"
  },
  {
    name: "晚景回声",
    theme: "人生从争取转向整理、回望、延续或执念。不要统一写成安详。"
  },
  {
    name: "人生终章",
    theme: "走马灯式总结，不评价，只回放。可以有克制的文学升华。"
  }
];
const GENERIC_CHOICES = new Set([
  "继续努力",
  "换个方向",
  "先观察情况",
  "主动尝试新机会",
  "先积累更多信息",
  "找信任的人商量"
]);

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

  if (story && choices.length >= 3 && !hasGenericChoices(choices.slice(0, 3))) {
    return normalizeStoryResult({
      story,
      choices: choices.slice(0, 3),
      source: "ai"
    });
  }

  return null;
}

function buildFallbackChoices(story) {
  if (story.includes("游戏") || story.includes("英雄联盟") || story.includes("开黑") || story.includes("队友")) {
    return ["控制游戏时间", "复盘今天的状态", "把注意力拉回现实"];
  }

  if (story.includes("大学") || story.includes("课程") || story.includes("校园") || story.includes("同学")) {
    return ["认真学习专业课", "参加校园活动", "寻找兼职机会"];
  }

  if (story.includes("工作") || story.includes("公司") || story.includes("同事") || story.includes("老板")) {
    return ["提升工作技能", "主动争取项目", "下班学习副业"];
  }

  if (story.includes("创业") || story.includes("客户") || story.includes("项目") || story.includes("产品")) {
    return ["寻找第一批客户", "优化产品方案", "邀请伙伴加入"];
  }

  if (story.includes("家庭") || story.includes("父母") || story.includes("家人")) {
    return ["和家人认真沟通", "独自做出决定", "先缓一缓再说"];
  }

  if (story.includes("钱") || story.includes("收入") || story.includes("存款") || story.includes("经济")) {
    return ["努力增加收入", "控制日常开销", "寻找新的机会"];
  }

  return ["整理眼前的风险", "联系一个关键人物", "做一个小规模尝试"];
}

function normalizeChoiceText(choice) {
  return choice
    .replace(/^(?:选项)?[ABC]\s*[：:、.]?\s*/i, "")
    .replace(/^[123]\s*[：:、.]?\s*/, "")
    .trim()
    .slice(0, 22);
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
    const choiceMatch = line.match(/^(?:选项)?([ABC])\s*[：:、.]\s*(.+)$/i);
    const numberedMatch = line.match(/^[123]\s*[：:、.]\s*(.+)$/);

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
      return /^(?:选项)?[ABC]\s*[：:、.]|^[123]\s*[：:、.]/i.test(line);
    });

    if (firstChoiceIndex > 0) {
      story = lines.slice(0, firstChoiceIndex).join("");
    }
  }

  if (story && choices.length >= 3) {
    return {
      story,
      choices: choices.slice(0, 3),
      source: "ai"
    };
  }

  return null;
}

function parseStoryResult(content) {
  const jsonText = extractJsonText(content);
  const lineResult = parseLineFormat(content);

  if (lineResult) {
    return lineResult;
  }

  const fallbackResult = {
    story: content,
    choices: buildFallbackChoices(content),
    source: "fallback"
  };

  try {
    const result = JSON.parse(repairLooseJson(jsonText));
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
      .slice(0, 3);

    if (!story || choices.length !== 3 || hasGenericChoices(choices)) {
      return {
        story: story || fallbackResult.story,
        choices: buildFallbackChoices(story || fallbackResult.story),
        source: "fallback"
      };
    }

    return normalizeStoryResult({ ...result, story, choices, source: "ai" });
  } catch (error) {
    const looseResult = parseLooseStoryResult(content);

    if (looseResult) {
      return looseResult;
    }

    return fallbackResult;
  }
}

function normalizeStoryResult(result) {
  const stageIndex = Number.isInteger(result.stageIndex) ? result.stageIndex : undefined;

  return {
    story: String(result.story || "").trim(),
    choices: Array.isArray(result.choices) ? result.choices.slice(0, 3) : buildFallbackChoices(result.story || ""),
    choiceType: normalizeChoiceType(result.choiceType),
    seeds: normalizeStringList(result.seeds, 4, 36),
    tendencies: normalizeStringList(result.tendencies, 4, 18),
    reflection: typeof result.reflection === "string" ? result.reflection.trim().slice(0, 220) : "",
    stage: typeof result.stage === "string" ? result.stage.trim().slice(0, 12) : undefined,
    stageIndex,
    source: result.source || "ai"
  };
}

function normalizeChoiceType(choiceType) {
  const allowedTypes = new Set(["major", "minor", "flavor"]);

  return allowedTypes.has(choiceType) ? choiceType : "minor";
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

function normalizeGameState(gameState, playerName) {
  if (!gameState || typeof gameState !== "object") {
    return {
      name: playerName,
      stageIndex: 0,
      stage: LIFE_STAGES[0].name,
      turn: 0,
      seeds: [],
      tendencies: [],
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
    lifeLog: Array.isArray(gameState.lifeLog) ? gameState.lifeLog.slice(-8) : []
  };
}

function formatRecentLifeLog(lifeLog) {
  if (!Array.isArray(lifeLog) || lifeLog.length === 0) {
    return "暂无";
  }

  return lifeLog.slice(-5).map(function (item) {
    return `${item.stage || "某阶段"}选择了「${item.choice || "未知选择"}」`;
  }).join("；");
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
    const shouldAdvanceStage = gameState.turn > 0 && gameState.turn % 6 === 0 && gameState.stageIndex < LIFE_STAGES.length - 2;

    const prompt = [
      "你正在为一个《AI人生模拟器》网页游戏生成下一幕。",
      "",
      "【玩家资料】",
      `姓名：${playerName}`,
      `当前阶段：${currentStage.name}`,
      `阶段主题：${currentStage.theme}`,
      `已经经历的选择次数：${gameState.turn}`,
      "",
      "【上一幕】",
      previousStory,
      "",
      "【玩家刚刚点击的选择】",
      choiceText,
      "",
      "【人生档案】",
      `人生种子：${gameState.seeds.length ? gameState.seeds.join("；") : "暂无"}`,
      `人生倾向：${gameState.tendencies.length ? gameState.tendencies.join("；") : "暂无"}`,
      `最近选择：${formatRecentLifeLog(gameState.lifeLog)}`,
      "",
      "【生成目标】",
      "1. 写出这个选择造成的直接后果，而不是跳到无关场景。",
      "2. 剧情必须符合当前阶段主题，不同阶段的认知、压力和可选路径必须不同。",
      "3. 剧情必须是现实人生模拟：学业、工作、家庭、金钱、关系、健康、城市生活、机会与压力。",
      "4. 如果出现游戏、聊天、娱乐，只能作为生活片段，不能让它吞掉人生主线。",
      "5. 不是每个选择都要站在人生岔路口。允许出现一个生活化、看似无关紧要的选项，它可能没有长期后果。",
      "6. 玩家不知道哪个选择会成为伏笔。不要显式标注选项重要程度。",
      "7. 关键事件必须稀有。本次除非人生档案自然指向关键回响，否则不要制造重大转折。",
      "8. NPC 可以出现，但必须服务于玩家个人主线，不要抢走主角位置。",
      "9. 不要评价玩家选择好坏，不要给分，不要使用成功、失败、正确、错误等评判词。",
      "10. 剧情 80 到 140 个中文字符，具体、有画面、有因果。",
      "11. 三个选项必须符合当前场景：可以包含重大选择、生活选择或日常选择，但都要自然。",
      "12. 禁止使用泛泛选项：继续努力、换个方向、先观察情况、主动尝试新机会、先积累更多信息、找信任的人商量。",
      shouldAdvanceStage
        ? `13. 本次需要生成一个阶段回响 reflection，并自然进入下一阶段：${LIFE_STAGES[gameState.stageIndex + 1].name}。阶段回响中性总结这一阶段发生了什么、得到与失去、留下的碎片，不评分。`
        : "13. 本次不需要阶段回响，reflection 返回空字符串。",
      "",
      "【输出格式】",
      "只返回合法 JSON，不要 Markdown，不要代码块，不要额外解释。",
      "JSON 必须包含 story、choices、choiceType、seeds、tendencies、reflection、stage、stageIndex：",
      "{\"story\":\"剧情文字\",\"choices\":[\"具体行动A\",\"具体行动B\",\"具体行动C\"],\"choiceType\":\"minor\",\"seeds\":[\"可能回响的生活种子\"],\"tendencies\":[\"自由\"],\"reflection\":\"\",\"stage\":\"人生初章\",\"stageIndex\":0}",
      "",
      "【字段说明】",
      "choiceType 只能是 major、minor、flavor 之一，代表刚才选择造成的影响级别，但不要在选项文字中体现。",
      "seeds 记录可能在未来回响的微小选择或生活碎片，可以为空数组。",
      "tendencies 记录玩家正在靠近的价值倾向，例如自由、安稳、家庭、理想、财富、权力、亲密、孤独，可以为空数组。",
      `stage 当前应为 ${shouldAdvanceStage ? LIFE_STAGES[gameState.stageIndex + 1].name : currentStage.name}。`,
      `stageIndex 当前应为 ${shouldAdvanceStage ? gameState.stageIndex + 1 : gameState.stageIndex}。`
    ].join("\n");

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
              "你的任务是根据上一幕和玩家选择，生成有因果连续性的下一幕。",
              "永远保持现实主义，不跑题，不把无关娱乐内容变成主线。",
              "你必须只输出合法 JSON，字段为 story 和 choices。"
            ].join("\n")
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.75,
        response_format: {
          type: "json_object"
        }
      })
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      sendJson(response, apiResponse.status, {
        error: data.error && data.error.message ? data.error.message : "AI 生成失败"
      });
      return;
    }

    const content = extractDeepSeekContent(data);
    const result = parseStoryResult(content);

    if (data.choices && data.choices[0] && data.choices[0].finish_reason === "length") {
      sendJson(response, 500, { error: "AI 输出被截断了，请重试一次。" });
      return;
    }

    sendJson(response, 200, result);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "服务器出错了" });
  }
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
    sendJson(response, 200, parseStoryResult("{ \"story\": \"你拨通镇民政所的电话，工作人员告知需要本人携带身份证和户口本原件前来办理，且今天下午他们开会不办公，建议明天上午来。挂断电话，你意识到这意味着要多花一天时间和往返车费。\", \"choices\": [ \"借辆自行车，现在骑几十里路去镇上碰碰运气\", \"先回打工的餐馆请假，明天一早坐班车去\", \"打电话给同村在镇上住的亲戚，问能否代办” ] }"));
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
