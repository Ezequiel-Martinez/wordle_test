const MODES = ["curiosity", "utility", "loss_aversion"];

const WORD_LENGTH = 5;
const VISIBLE_ATTEMPTS = 4;
const REQUIRED_ROUNDS = 5;
const OPTIONAL_ROUNDS = 2;
const TOTAL_ROUNDS = REQUIRED_ROUNDS + OPTIONAL_ROUNDS;
const STARTING_SCORE = 100;
const WRONG_ATTEMPT_PENALTY = 5;
const ROUND_ADVANCE_MS = 750;
const SPECIAL_TEST_WORD = "()()*";

const SHARED_PATTERN_LABEL = "prendas_y_accesorios";
const KEYWORDS_FILE = "palabras_clave.txt";

const FRAMING_CONTENT = {
  curiosity: {
    title: "Descubre la conexi&oacute;n",
    body: 'Estas palabras no son independientes. Comparten una <span class="modal-highlight-success">l&oacute;gica oculta</span> y cada intento te da informaci&oacute;n para descubrirla. Intenta de entender el patr&oacute;n entre rondas.',
  },
  utility: {
    title: "Resuelve con eficiencia",
    body: 'Completa cada palabra con la mayor eficiencia posible, usando la <span class="modal-highlight-danger">menor cantidad de intentos</span> y avanzando lo m&aacute;s r&aacute;pido que puedas',
  },
  loss_aversion: {
    title: "Conserva tus puntos",
    body: 'Empiezas con 100 puntos. Cada intento incorrecto v&aacute;lido <span class="modal-highlight-danger">resta 5 puntos</span>. Intenta conservar la mayor cantidad de puntos posible.',
  },
};

const el = {
  attemptGrid: document.getElementById("attemptGrid"),
  completionScreen: document.getElementById("completionScreen"),
  eventToast: document.getElementById("eventToast"),
  experimentShell: document.getElementById("experimentShell"),
  feedbackText: document.getElementById("feedbackText"),
  guessForm: document.getElementById("guessForm"),
  guessInput: document.getElementById("guessInput"),
  inputShell: document.getElementById("inputShell"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  modalPrimary: document.getElementById("modalPrimary"),
  modalSecondary: document.getElementById("modalSecondary"),
  modalText: document.getElementById("modalText"),
  roundMeta: document.getElementById("roundMeta"),
  scoreDelta: document.getElementById("scoreDelta"),
  secondaryMeta: document.getElementById("secondaryMeta"),
  submitButton: document.getElementById("submitButton"),
  validationMessage: document.getElementById("validationMessage"),
};

let state = null;
let scoreDeltaTimeoutId = null;
let eventToastFadeTimeoutId = null;
let eventToastHideTimeoutId = null;
let validWords = [];
let validWordSet = new Set();
let keywordPool = [];

function pickRandomMode() {
  const index = Math.floor(Math.random() * MODES.length);
  return MODES[index];
}

function repairMojibake(value) {
  if (!/[��?]/.test(value)) {
    return value;
  }

  try {
    const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return value;
  }
}

function normalizeWord(value) {
  return repairMojibake(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z�]/g, "");
}

function expandGenderVariant(baseWord, variantSuffix) {
  if (!variantSuffix) return [];

  const normalizedBase = normalizeWord(baseWord);
  const normalizedSuffix = normalizeWord(variantSuffix);

  if (!normalizedBase || !normalizedSuffix) {
    return [];
  }

  const expanded = new Set();

  if (normalizedSuffix.length <= Math.min(3, normalizedBase.length)) {
    expanded.add(
      `${normalizedBase.slice(0, normalizedBase.length - normalizedSuffix.length)}${normalizedSuffix}`,
    );
  }

  if (normalizedBase.endsWith(normalizedSuffix[0])) {
    expanded.add(`${normalizedBase}${normalizedSuffix.slice(1)}`);
  }

  expanded.add(`${normalizedBase}${normalizedSuffix}`);
  return Array.from(expanded);
}

function extractCandidateWords(line) {
  const compactLine = repairMojibake(line).trim().toLowerCase();
  if (!compactLine) return [];

  const parts = compactLine
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];

  const [basePart, ...variantParts] = parts;
  const candidates = new Set();
  const normalizedBase = normalizeWord(basePart);

  if (normalizedBase) {
    candidates.add(normalizedBase);
  }

  variantParts.forEach((variantPart) => {
    expandGenderVariant(basePart, variantPart).forEach((candidate) => {
      if (candidate) {
        candidates.add(candidate);
      }
    });
  });

  return Array.from(candidates);
}

function parseWordsFile(text) {
  const words = text
    .split(/\r?\n/)
    .flatMap((line) => extractCandidateWords(line))
    .filter((word) => word.length === WORD_LENGTH);

  return Array.from(new Set(words));
}

async function loadTextFile(path) {
  let text = "";
  let lastError = null;

  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`No se pudo cargar ${path} (${response.status})`);
    }
    text = await response.text();
  } catch (error) {
    lastError = error;
  }

  if (!text) {
    try {
      text = await new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("GET", path, true);
        request.overrideMimeType("text/plain; charset=utf-8");
        request.onload = () => {
          if (
            request.status === 0 ||
            (request.status >= 200 && request.status < 300)
          ) {
            resolve(request.responseText);
            return;
          }

          reject(new Error(`No se pudo cargar ${path} (${request.status})`));
        };
        request.onerror = () => {
          reject(
            new Error(`El navegador bloque� la lectura local de ${path}.`),
          );
        };
        request.send();
      });
    } catch (error) {
      lastError = error;
    }
  }

  if (!text) {
    throw lastError || new Error(`No se pudo cargar ${path}.`);
  }

  return text;
}

async function loadWords() {
  validWords = parseWordsFile(await loadTextFile("words.txt"));
  validWordSet = new Set(validWords);

  if (validWords.length === 0) {
    throw new Error(
      `words.txt no contiene palabras v�lidas de ${WORD_LENGTH} letras.`,
    );
  }
}

async function loadKeywordPool() {
  const text = await loadTextFile(KEYWORDS_FILE);
  const parsedKeywords = text
    .split(/\r?\n/)
    .flatMap((line) => line.split(","))
    .map((line) => normalizeWord(line))
    .filter((word) => word.length === WORD_LENGTH)
    .filter((word) => validWordSet.has(word));

  keywordPool = Array.from(new Set(parsedKeywords));

  if (keywordPool.length < TOTAL_ROUNDS) {
    throw new Error(
      `${KEYWORDS_FILE} no tiene suficientes palabras v�lidas de ${WORD_LENGTH} letras para ${TOTAL_ROUNDS} rondas.`,
    );
  }
}

function pickTargetWords() {
  return keywordPool.slice(0, TOTAL_ROUNDS);
}

function createInitialState() {
  return {
    sessionId: `word_pattern_${Date.now()}`,
    mode: pickRandomMode(),
    introAccepted: false,
    optionalAccepted: false,
    currentRoundIndex: 0,
    targetWords: pickTargetWords(),
    roundAttempts: Array(TOTAL_ROUNDS).fill(0),
    roundSolved: Array(TOTAL_ROUNDS).fill(false),
    roundGuesses: Array.from({ length: TOTAL_ROUNDS }, () => []),
    totalWrongAttempts: 0,
    score: STARTING_SCORE,
    transitionLocked: false,
    finalizedReason: "in_progress",
    createdAtIso: new Date().toISOString(),
    startedAtPerf: performance.now(),
  };
}

function getCurrentRoundNumber() {
  return Math.min(state.currentRoundIndex + 1, TOTAL_ROUNDS);
}

function getVisibleTotalRounds() {
  return state.optionalAccepted || state.currentRoundIndex >= REQUIRED_ROUNDS
    ? TOTAL_ROUNDS
    : REQUIRED_ROUNDS;
}

function getCurrentTargetWord() {
  return state.targetWords[state.currentRoundIndex];
}

function getCurrentRoundGuesses() {
  return state.roundGuesses[state.currentRoundIndex];
}

function getTotalAttemptCount() {
  return state.roundAttempts.reduce((total, attempts) => total + attempts, 0);
}

function isModalOpen() {
  return !el.modalBackdrop.classList.contains("hidden");
}

function getLastRoundReached() {
  if (!state) return 0;

  if (state.currentRoundIndex >= TOTAL_ROUNDS) {
    return TOTAL_ROUNDS;
  }

  if (state.currentRoundIndex === REQUIRED_ROUNDS && !state.optionalAccepted) {
    return REQUIRED_ROUNDS;
  }

  return Math.min(state.currentRoundIndex + 1, TOTAL_ROUNDS);
}

function buildResult(reason = state?.finalizedReason || "in_progress") {
  if (!state) return null;

  const errorsByRound = state.roundAttempts.map((attempts, index) => ({
    round_number: index + 1,
    errors: Math.max(0, attempts - (state.roundSolved[index] ? 1 : 0)),
  }));

  return {
    session_id: state.sessionId,
    mode: state.mode,
    last_round_reached: getLastRoundReached(),
    total_errors: state.totalWrongAttempts,
    errors_by_round: errorsByRound,
    clicked_continue_extra_rounds: state.optionalAccepted,
    completed_extra_rounds: state.currentRoundIndex >= TOTAL_ROUNDS,
    total_time_ms: Math.round(performance.now() - state.startedAtPerf),
  };
}

function syncDisconnectFallback() {
  if (!state || state.finalizedReason !== "in_progress") return;

  const payload = buildResult("pagehide");
  if (!payload) return;

  void window.OpenLockDatabase.queueDisconnectSession(payload).catch(
    (error) => {
      console.error("Could not update disconnect fallback.", error);
    },
  );
}

function persistProgress(reason = "in_progress") {
  if (!state || state.finalizedReason !== "in_progress") return;

  const payload = buildResult(reason);
  if (!payload) return;

  void window.OpenLockDatabase.saveSession(payload).catch((error) => {
    console.error("Could not persist session progress.", error);
  });
}

function setFormDisabled(disabled) {
  el.guessInput.disabled = disabled;
  el.submitButton.disabled = disabled;
}

function focusGuessInput() {
  window.setTimeout(() => {
    if (el.guessInput.disabled) return;
    el.guessInput.focus();
    el.guessInput.select();
  }, 0);
}

function clearScoreDelta() {
  if (scoreDeltaTimeoutId) {
    window.clearTimeout(scoreDeltaTimeoutId);
    scoreDeltaTimeoutId = null;
  }

  el.scoreDelta.textContent = "";
  el.scoreDelta.className = "meta-delta hidden";
}

function showScoreDelta(points, tone) {
  clearScoreDelta();
  el.scoreDelta.textContent = `${points > 0 ? "+" : ""}${points} puntos`;
  el.scoreDelta.className = `meta-delta ${tone}`;
  scoreDeltaTimeoutId = window.setTimeout(() => {
    clearScoreDelta();
  }, 1200);
}

function clearEventToast() {
  if (eventToastFadeTimeoutId) {
    window.clearTimeout(eventToastFadeTimeoutId);
    eventToastFadeTimeoutId = null;
  }

  if (eventToastHideTimeoutId) {
    window.clearTimeout(eventToastHideTimeoutId);
    eventToastHideTimeoutId = null;
  }

  el.eventToast.textContent = "";
  el.eventToast.className = "event-toast hidden";
}

function showEventToast(message, tone) {
  clearEventToast();
  el.eventToast.textContent = message;
  el.eventToast.className = `event-toast ${tone}`;

  eventToastFadeTimeoutId = window.setTimeout(() => {
    el.eventToast.classList.add("is-fading");
  }, 1100);

  eventToastHideTimeoutId = window.setTimeout(() => {
    clearEventToast();
  }, 1500);
}

function updateMeta() {
  el.roundMeta.textContent = `Ronda ${Math.min(
    getCurrentRoundNumber(),
    getVisibleTotalRounds(),
  )} de ${getVisibleTotalRounds()}`;

  el.secondaryMeta.classList.remove("hidden", "utility-total", "loss-score");

  if (state.mode === "utility") {
    el.secondaryMeta.textContent = `Intentos totales: ${getTotalAttemptCount()}`;
    el.secondaryMeta.classList.add("utility-total");
    return;
  }

  if (state.mode === "loss_aversion") {
    el.secondaryMeta.textContent = `Puntaje: ${state.score}`;
    el.secondaryMeta.classList.add("loss-score");
    return;
  }

  el.secondaryMeta.classList.add("hidden");
  el.secondaryMeta.textContent = "";
}

function showFeedback(text, tone = "default") {
  el.feedbackText.textContent = text;
  el.feedbackText.className =
    tone === "success"
      ? "feedback-text success"
      : tone === "error"
        ? "feedback-text error"
        : "feedback-text";
}

function renderIdleFeedback() {
  el.feedbackText.textContent = " ";
  el.feedbackText.className = "feedback-text";
}

function clearValidation() {
  el.inputShell.classList.remove("has-error");
  el.validationMessage.textContent = " ";
  el.validationMessage.className = "validation-message";
}

function showValidation(message) {
  el.inputShell.classList.add("has-error");
  el.validationMessage.textContent = message;
  el.validationMessage.className = "validation-message visible";
}

function buildEmptyRow() {
  return {
    type: "empty",
    letters: Array(WORD_LENGTH).fill(""),
    feedback: Array(WORD_LENGTH).fill("empty"),
  };
}

function buildPreviewRow(word) {
  const letters = word.toUpperCase().split("");
  while (letters.length < WORD_LENGTH) {
    letters.push("");
  }

  return {
    type: "preview",
    letters,
    feedback: Array(WORD_LENGTH).fill("preview"),
  };
}

function buildCommittedRow(entry) {
  return {
    type: "committed",
    letters: entry.guessDisplay.split(""),
    feedback: entry.feedback,
  };
}

function renderAttemptGrid() {
  if (!state) {
    el.attemptGrid.innerHTML = "";
    return;
  }

  const rows = getCurrentRoundGuesses()
    .slice(-VISIBLE_ATTEMPTS)
    .map((entry) => buildCommittedRow(entry));

  const previewWord = normalizeWord(el.guessInput.value).slice(0, WORD_LENGTH);
  if (
    previewWord &&
    rows.length < VISIBLE_ATTEMPTS &&
    !state.roundSolved[state.currentRoundIndex]
  ) {
    rows.push(buildPreviewRow(previewWord));
  }

  while (rows.length < VISIBLE_ATTEMPTS) {
    rows.unshift(buildEmptyRow());
  }

  el.attemptGrid.innerHTML = rows
    .map((row) => {
      const cells = row.letters
        .map((letter, index) => {
          const tone = row.feedback[index];
          return `<span class="tile tile--${tone}">${letter}</span>`;
        })
        .join("");

      return `<div class="attempt-row attempt-row--${row.type}">${cells}</div>`;
    })
    .join("");
}

function renderRound() {
  el.guessInput.value = "";
  clearValidation();
  renderIdleFeedback();
  updateMeta();
  clearScoreDelta();
  clearEventToast();
  renderAttemptGrid();
  setFormDisabled(false);
  state.transitionLocked = false;
  focusGuessInput();
}

function evaluateGuess(guess, target) {
  const feedback = Array(WORD_LENGTH).fill("absent");
  const remaining = {};

  for (let index = 0; index < WORD_LENGTH; index += 1) {
    if (guess[index] === target[index]) {
      feedback[index] = "correct";
    } else {
      remaining[target[index]] = (remaining[target[index]] || 0) + 1;
    }
  }

  for (let index = 0; index < WORD_LENGTH; index += 1) {
    if (feedback[index] === "correct") continue;

    const letter = guess[index];
    if (remaining[letter] > 0) {
      feedback[index] = "present";
      remaining[letter] -= 1;
    }
  }

  return feedback;
}

function buildFramingMarkup(mode) {
  const content = FRAMING_CONTENT[mode];
  return `
    <span class="modal-heading">${content.title}</span>
    <span class="modal-body">${content.body}</span>
  `;
}

function configureModal({
  text,
  primaryLabel,
  secondaryLabel = "",
  onPrimary,
  onSecondary = null,
}) {
  el.modalText.innerHTML = text;
  el.modalPrimary.textContent = primaryLabel;
  el.modalSecondary.textContent = secondaryLabel;
  el.modalSecondary.classList.toggle("hidden", !secondaryLabel);

  el.modalPrimary.onclick = onPrimary;
  el.modalSecondary.onclick = onSecondary;
  el.modalBackdrop.classList.remove("hidden");
}

function closeModal() {
  el.modalBackdrop.classList.add("hidden");
  el.modalPrimary.onclick = null;
  el.modalSecondary.onclick = null;
}

function showIntroModal() {
  setFormDisabled(true);
  configureModal({
    text: buildFramingMarkup(state.mode),
    primaryLabel: "Empezar",
    onPrimary: startGame,
  });
}

function showLoadErrorModal(error) {
  console.error("Could not initialize the word game.", error);
  setFormDisabled(true);
  configureModal({
    text: `
      <span class="modal-heading">No se pudo cargar un archivo del juego</span>
      <span class="modal-body">${error?.message || "Verifica que el archivo exista y que el navegador permita leerlo."}</span>
    `,
    primaryLabel: "Recargar",
    onPrimary: () => {
      window.location.reload();
    },
  });
}

function startGame() {
  state.introAccepted = true;
  closeModal();
  renderRound();
  syncDisconnectFallback();
}

function finishSession(reason) {
  if (!state || state.finalizedReason !== "in_progress") return;

  state.finalizedReason = reason;
  const result = buildResult(reason);

  console.log("Word pattern result:", result);

  void (async () => {
    try {
      await window.OpenLockDatabase.saveSession(result);
      await window.OpenLockDatabase.cancelDisconnectSession(state.sessionId);
    } catch (error) {
      console.error("Could not save session.", error);
    }
  })();

  closeModal();
  el.experimentShell.classList.add("hidden");
  el.completionScreen.classList.remove("hidden");
}

function maybeAdvanceAfterSuccess() {
  state.currentRoundIndex += 1;

  if (state.currentRoundIndex === REQUIRED_ROUNDS && !state.optionalAccepted) {
    persistProgress();
    syncDisconnectFallback();
    setFormDisabled(true);
    configureModal({
      text: `
        <span class="modal-heading">Llegaste al final del bloque principal</span>
        <span class="modal-body">¿Quieres jugar 2 rondas extra?</span>
      `,
      primaryLabel: "Continuar",
      secondaryLabel: "Finalizar",
      onPrimary: () => {
        state.optionalAccepted = true;
        closeModal();
        renderRound();
        persistProgress();
        syncDisconnectFallback();
      },
      onSecondary: () => {
        finishSession("finished_after_required");
      },
    });
    return;
  }

  if (state.currentRoundIndex >= TOTAL_ROUNDS) {
    finishSession("completed_all_rounds");
    return;
  }

  renderRound();
  syncDisconnectFallback();
}

function handleSuccessfulAttempt(guess, feedback) {
  state.roundSolved[state.currentRoundIndex] = true;
  state.roundGuesses[state.currentRoundIndex].push({
    guess,
    guessDisplay:
      guess === SPECIAL_TEST_WORD ? SPECIAL_TEST_WORD : guess.toUpperCase(),
    feedback,
  });
  state.roundAttempts[state.currentRoundIndex] += 1;

  el.guessInput.value = "";
  updateMeta();
  clearValidation();
  renderAttemptGrid();
  showFeedback("Palabra correcta.", "success");
  syncDisconnectFallback();

  window.setTimeout(() => {
    maybeAdvanceAfterSuccess();
  }, ROUND_ADVANCE_MS);
}

function handleWrongAttempt(guess, feedback) {
  state.roundGuesses[state.currentRoundIndex].push({
    guess,
    guessDisplay:
      guess === SPECIAL_TEST_WORD ? SPECIAL_TEST_WORD : guess.toUpperCase(),
    feedback,
  });
  state.roundAttempts[state.currentRoundIndex] += 1;
  state.totalWrongAttempts += 1;

  if (state.mode === "loss_aversion") {
    state.score = Math.max(0, state.score - WRONG_ATTEMPT_PENALTY);
    showScoreDelta(-WRONG_ATTEMPT_PENALTY, "negative");
    showEventToast("Perdiste 5 puntos", "negative");
  }

  if (state.mode === "utility") {
    showEventToast("Gastaste 1 intento", "negative");
  }

  el.guessInput.value = "";
  updateMeta();
  clearValidation();
  renderAttemptGrid();
  showFeedback("Sigue intentando.");
  syncDisconnectFallback();

  state.transitionLocked = false;
  setFormDisabled(false);
  focusGuessInput();
}

function submitGuess(rawValue) {
  const trimmedValue = rawValue.trim();
  if (trimmedValue === SPECIAL_TEST_WORD) {
    clearValidation();
    state.transitionLocked = true;
    setFormDisabled(true);
    handleSuccessfulAttempt(
      SPECIAL_TEST_WORD,
      Array(WORD_LENGTH).fill("correct"),
    );
    return;
  }

  const normalizedGuess = normalizeWord(rawValue);

  if (!normalizedGuess || normalizedGuess.length !== WORD_LENGTH) {
    showValidation("Escribe exactamente 5 letras.");
    return;
  }

  if (!validWordSet.has(normalizedGuess)) {
    showValidation("Esa palabra no existe en el diccionario");
    return;
  }

  clearValidation();
  state.transitionLocked = true;
  setFormDisabled(true);

  const target = getCurrentTargetWord();
  const feedback = evaluateGuess(normalizedGuess, target);

  if (normalizedGuess === target) {
    handleSuccessfulAttempt(normalizedGuess, feedback);
    return;
  }

  handleWrongAttempt(normalizedGuess, feedback);
}

async function initializeSession() {
  setFormDisabled(true);
  renderIdleFeedback();
  clearValidation();

  try {
    await loadWords();
    await loadKeywordPool();
    state = createInitialState();
    renderRound();
    setFormDisabled(true);
    showIntroModal();
    syncDisconnectFallback();
  } catch (error) {
    showLoadErrorModal(error);
  }
}

el.guessForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!state || state.transitionLocked || isModalOpen()) {
    return;
  }

  submitGuess(el.guessInput.value);
});

el.guessInput.addEventListener("input", () => {
  clearValidation();
  renderAttemptGrid();
});

window.addEventListener("pagehide", () => {
  if (!state || state.finalizedReason !== "in_progress") return;

  state.finalizedReason = "pagehide";
  void window.OpenLockDatabase.saveSession(buildResult("pagehide"));
});

window.addEventListener("beforeunload", () => {
  if (!state || state.finalizedReason !== "in_progress") return;

  state.finalizedReason = "closed_window";
  void window.OpenLockDatabase.saveSession(buildResult("closed_window"));
});

window.addEventListener("load", initializeSession);
