const startForm = document.querySelector("#startForm");
const welcomeTitle = document.querySelector("#welcomeTitle");
const storyText = document.querySelector("#storyText");
const choiceButtons = document.querySelectorAll("[data-choice]");
const statusText = document.querySelector("#statusText");
const reflectionPanel = document.querySelector("#reflectionPanel");
const serverOrigin = "http://localhost:8000";
const saveVersion = 3;

const fallbackChoices = ["整理眼前的风险", "联系一个关键人物", "做一个小规模尝试"];
const params = new URLSearchParams(window.location.search);
const playerName = params.get("name") || "你";
const stateKey = "aiLifeSimulatorState:" + playerName;

if (startForm) {
  startForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const nameInput = document.querySelector("#playerName");
    const playerName = nameInput.value.trim();

    if (!playerName) {
      alert("请先输入姓名");
      return;
    }

    localStorage.removeItem("aiLifeSimulatorState:" + playerName);

    const nextPage = "/simulation.html?name=" + encodeURIComponent(playerName);
    window.location.href = window.location.protocol === "file:" ? serverOrigin + nextPage : nextPage;
  });
}

if (welcomeTitle) {
  const gameState = loadGameState();
  renderGameState(gameState);
}

if (choiceButtons.length > 0 && storyText) {
  choiceButtons.forEach(function (button) {
    button.addEventListener("click", async function () {
      const gameState = loadGameState();
      const choice = button.dataset.choice || button.textContent;

      setLoading(true);
      statusText.textContent = "命运正在推演中...";

      try {
        if (window.location.protocol === "file:") {
          window.location.href = serverOrigin + "/simulation.html" + window.location.search;
          return;
        }

        const response = await fetch("/api/story", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: playerName,
            choice: choice,
            previousStory: storyText.textContent,
            gameState: gameState
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "AI 生成失败");
        }

        storyText.textContent = data.story || "你做出了选择，人生进入了新的阶段。";
        updateChoices(data.choices || fallbackChoices);

        const nextState = updateGameState(gameState, choice, data);
        saveGameState(nextState);
        renderGameState(nextState);

        statusText.textContent = data.reflection
          ? "这一段日子留下了新的回声。"
          : "命运收下了你的答案，并递来了新的提问。";
      } catch (error) {
        storyText.textContent = "你做出了选择，但命运暂时沉默。也许先停下来想想，是另一种前进。";
        updateChoices(fallbackChoices);
        statusText.textContent = "命运的回声暂时模糊：" + error.message;
      } finally {
        setLoading(false);
      }
    });
  });
}

function createInitialState() {
  return {
    name: playerName,
    stageIndex: 0,
    stage: "高考之后",
    turn: 0,
    seeds: [],
    tendencies: [],
    lifeLog: [],
    saveVersion: saveVersion
  };
}

function loadGameState() {
  try {
    const savedState = JSON.parse(localStorage.getItem(stateKey));

    if (savedState && savedState.name === playerName && savedState.saveVersion === saveVersion) {
      return savedState;
    }
  } catch (error) {
    localStorage.removeItem(stateKey);
  }

  const initialState = createInitialState();
  saveGameState(initialState);
  return initialState;
}

function saveGameState(gameState) {
  localStorage.setItem(stateKey, JSON.stringify(gameState));
}

function updateGameState(gameState, choice, data) {
  const nextState = {
    ...gameState,
    stage: data.stage || gameState.stage,
    stageIndex: Number.isInteger(data.stageIndex) ? data.stageIndex : gameState.stageIndex,
    turn: gameState.turn + 1,
    seeds: mergeUnique(gameState.seeds, data.seeds || [], 12),
    tendencies: mergeUnique(gameState.tendencies, data.tendencies || [], 8),
    lastReflection: data.reflection || "",
    saveVersion: saveVersion,
    lifeLog: gameState.lifeLog.concat({
      stage: gameState.stage,
      choice: choice,
      result: data.story || "",
      choiceType: data.choiceType || "unknown",
      lifeDomain: data.lifeDomain || "日常"
    }).slice(-24)
  };

  return nextState;
}

function mergeUnique(currentItems, newItems, maxCount) {
  const items = currentItems.concat(newItems)
    .filter(function (item) {
      return typeof item === "string" && item.trim();
    })
    .map(function (item) {
      return item.trim();
    });

  return Array.from(new Set(items)).slice(-maxCount);
}

function renderGameState(gameState) {
  welcomeTitle.textContent = gameState.stage + " · " + playerName;

  if (!reflectionPanel) {
    return;
  }

  if (!gameState.lastReflection) {
    reflectionPanel.hidden = true;
    reflectionPanel.textContent = "";
    return;
  }

  reflectionPanel.hidden = false;
  reflectionPanel.textContent = gameState.lastReflection;
}

function setLoading(isLoading) {
  choiceButtons.forEach(function (button) {
    button.disabled = isLoading;
  });
}

function updateChoices(choices) {
  choiceButtons.forEach(function (button, index) {
    const choiceText = choices[index] || fallbackChoices[index];
    const prefix = ["A", "B", "C"][index];

    button.textContent = prefix + " " + choiceText;
    button.dataset.choice = choiceText;
  });
}
