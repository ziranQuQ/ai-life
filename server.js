const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8000);
const ROOT_DIR = __dirname;

loadEnvFile();

const DEEPSEEK_API_KEY = cleanEnvValue(process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEKAPIKEY);
const DEEPSEEK_MODEL = normalizeDeepSeekModel(process.env.DEEPSEEK_MODEL || process.env.DEEPSEEKMODEL);
const DEFAULT_STORY = "高考结束了，你站在人生的第一个重要路口。未来会怎样，还没有答案。";
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
    return {
      story,
      choices: choices.slice(0, 3),
      source: "ai"
    };
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

    return { story, choices, source: "ai" };
  } catch (error) {
    const looseResult = parseLooseStoryResult(content);

    if (looseResult) {
      return looseResult;
    }

    return fallbackResult;
  }
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

    const prompt = [
      "你正在为一个《AI人生模拟器》网页游戏生成下一幕。",
      "",
      "【玩家资料】",
      `姓名：${playerName}`,
      "年龄：18岁",
      "",
      "【上一幕】",
      previousStory,
      "",
      "【玩家刚刚点击的选择】",
      choiceText,
      "",
      "【生成目标】",
      "1. 写出这个选择造成的直接后果，而不是跳到无关场景。",
      "2. 剧情必须是现实人生模拟：学业、工作、家庭、金钱、关系、健康、城市生活、机会与压力。",
      "3. 如果出现游戏、聊天、娱乐，只能作为生活片段，不能让它吞掉人生主线。",
      "4. 不要突然引入和上一幕无关的人名、职业、地点或事件。",
      "5. 不要写成爽文、玄幻、科幻、战斗、系统流或搞笑段子。",
      "6. 剧情 80 到 140 个中文字符，具体、有画面、有因果。",
      "7. 三个选项必须紧扣刚生成的剧情，每个选项都要是玩家下一步能做的具体行动。",
      "8. 禁止使用泛泛选项：继续努力、换个方向、先观察情况、主动尝试新机会、先积累更多信息、找信任的人商量。",
      "",
      "【输出格式】",
      "只返回合法 JSON，不要 Markdown，不要代码块，不要额外解释。",
      "JSON 必须包含 story 和 choices：",
      "{\"story\":\"剧情文字\",\"choices\":[\"具体行动A\",\"具体行动B\",\"具体行动C\"]}",
      "",
      "【好例子】",
      "{\"story\":\"你把录取通知书放在桌上，母亲算着学费沉默了很久。县城的夏夜很闷，你第一次意识到，大学不只是远方，也是一笔现实的账。\",\"choices\":[\"申请助学贷款\",\"暑假去打短工\",\"和母亲重新算预算\"]}"
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
