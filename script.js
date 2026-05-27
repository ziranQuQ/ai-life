const startForm = document.querySelector("#startForm");
const welcomeTitle = document.querySelector("#welcomeTitle");
const storyText = document.querySelector("#storyText");
const choiceButtons = document.querySelectorAll("[data-choice]");
const statusText = document.querySelector("#statusText");
const serverOrigin = "http://localhost:8000";

const fallbackChoices = ["整理眼前的风险", "联系一个关键人物", "做一个小规模尝试"];

const params = new URLSearchParams(window.location.search);
const playerName = params.get("name") || "你";

if (startForm) {
  startForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const nameInput = document.querySelector("#playerName");
    const playerName = nameInput.value.trim();

    if (!playerName) {
      alert("请先输入姓名");
      return;
    }

    const nextPage = "/simulation.html?name=" + encodeURIComponent(playerName);
    window.location.href = window.location.protocol === "file:" ? serverOrigin + nextPage : nextPage;
  });
}

if (welcomeTitle) {
  welcomeTitle.textContent = "人生初章 · " + playerName;
}

if (choiceButtons.length > 0 && storyText) {
  choiceButtons.forEach(function (button) {
    button.addEventListener("click", async function () {
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
            previousStory: storyText.textContent
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "AI 生成失败");
        }

        storyText.textContent = data.story || "你做出了选择，人生进入了新的阶段。";
        updateChoices(data.choices || fallbackChoices);
        statusText.textContent = data.source === "fallback"
          ? "剧情已生成，选项由备用逻辑生成。"
          : "命运收下了你的答案，并递来了新的提问。";
      } catch (error) {
        storyText.textContent = "你做出了选择，但命运暂时沉默。也许先停下来想想，是另一种前进。";
        updateChoices(fallbackChoices);
        statusText.textContent = "命运的回声暂时模糊，先沿着眼前的路继续。";
      } finally {
        setLoading(false);
      }
    });
  });
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
