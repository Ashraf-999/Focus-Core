const setupScreen = document.querySelector('#setup-screen');
const timerScreen = document.querySelector('#timer-screen');
const completeScreen = document.querySelector('#complete-screen');
const setupForm = document.querySelector('#setup-form');
const goalInput = document.querySelector('#goal-input');
const durationInput = document.querySelector('#duration-input');
const rewardInput = document.querySelector('#reward-input');
const breakToggle = document.querySelector('#break-toggle');
const breakIntervalInput = document.querySelector('#break-interval-input');
const breakDurationInput = document.querySelector('#break-duration-input');
const audioUrlInput = document.querySelector('#audio-url-input');
const audioToggle = document.querySelector('#audio-toggle');
const testAudioButton = document.querySelector('#test-audio-button');
const audioMessage = document.querySelector('#audio-message');
const goalDisplay = document.querySelector('#goal-display');
const rewardDisplay = document.querySelector('#reward-display');
const focusProgress = document.querySelector('#focus-progress');
const focusPercent = document.querySelector('#focus-percent');
const timeLeft = document.querySelector('#time-left');
const breakModule = document.querySelector('#break-module');
const breakProgress = document.querySelector('#break-progress');
const breakPercent = document.querySelector('#break-percent');
const breakLeft = document.querySelector('#break-left');
const statusStrip = document.querySelector('#status-strip');
const progressLayout = document.querySelector('#progress-layout');
const pauseButton = document.querySelector('#pause-button');
const stopButton = document.querySelector('#stop-button');
const completeGoal = document.querySelector('#complete-goal');
const completeReward = document.querySelector('#complete-reward');
const claimButton = document.querySelector('#claim-button');
const claimedMessage = document.querySelector('#claimed-message');
const SESSION_STORAGE_KEY = 'focus-core-session';
const AUDIO_SETTINGS_KEY = 'focus-core-audio-settings';
const notificationSound = new Audio('./Notification%20Sound.wav');
notificationSound.preload = 'auto';
notificationSound.volume = 0.65;
const rewardSound = new Audio('./koiroylers-correct-356013.mp3');
rewardSound.preload = 'auto';
rewardSound.volume = 0.8;
let notificationRegistration;
let serviceWorkerReady;
let wakeLock = null;
let wakeLockRequest = null;
let userAudio = null;
let youtubePlayer = null;
let testingAudio = false;

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock && !wakeLock.released || wakeLockRequest) return;

  wakeLockRequest = navigator.wakeLock.request('screen')
    .then((lock) => {
      wakeLock = lock;
      lock.addEventListener('release', () => {
        wakeLock = null;
        if (isActiveSession() && document.visibilityState === 'visible') void requestWakeLock();
      });
    })
    .catch((error) => {
      console.error('Wake Lock request failed:', error);
    })
    .finally(() => {
      wakeLockRequest = null;
    });
  await wakeLockRequest;
}

function isActiveSession() {
  return state.totalFocusMs > 0 && ['focus', 'break'].includes(state.status);
}

async function releaseWakeLock() {
  if (wakeLockRequest) await wakeLockRequest;
  if (!wakeLock) return;

  try {
    await wakeLock.release();
  } catch (error) {
    console.error('Wake Lock release failed:', error);
  } finally {
    wakeLock = null;
  }
}

function createNotificationToneUrl({ frequency = 660, durationSeconds = 0.2, amplitude = 0.35 } = {}) {
  const sampleRate = 22050;
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const samples = new Int16Array(totalSamples);

  for (let index = 0; index < totalSamples; index += 1) {
    const time = index / sampleRate;
    const attack = Math.min(1, time / 0.02);
    const release = Math.max(0, 1 - (time / durationSeconds));
    const envelope = attack * release;
    const value = Math.sin(2 * Math.PI * frequency * time) * amplitude * envelope;
    samples[index] = Math.max(-1, Math.min(1, value)) * 32767;
  }

  const bytesPerSample = 2;
  const blockAlign = 1 * bytesPerSample;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  function writeString(offset, text) {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(44 + index * bytesPerSample, samples[index], true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function createRewardConfettiUrl() {
  const sampleRate = 22050;
  const durationSeconds = 0.48;
  const totalSamples = Math.floor(sampleRate * durationSeconds);
  const samples = new Float32Array(totalSamples);

  for (let index = 0; index < totalSamples; index += 1) {
    const time = index / sampleRate;
    const popEnvelope = Math.exp(-time * 28);
    const sparkleEnvelope = Math.max(0, 1 - (time / 0.1));
    const tailEnvelope = Math.exp(-time * 10);

    const pop = Math.sin(2 * Math.PI * 1320 * time) * 0.7 * popEnvelope;
    const sparkle = Math.sin(2 * Math.PI * (700 + time * 1800) * time) * 0.24 * sparkleEnvelope;
    const secondaryPop = Math.sin(2 * Math.PI * 980 * time) * 0.2 * Math.exp(-time * 16) * (1 - Math.min(1, time / 0.06));
    const tail = Math.sin(2 * Math.PI * 260 * time) * 0.12 * tailEnvelope;
    const value = pop + sparkle + secondaryPop + tail;
    samples[index] = Math.max(-1, Math.min(1, value));
  }

  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  function writeString(offset, text) {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(44 + index * bytesPerSample, Math.max(-1, Math.min(1, samples[index])) * 32767, true);
  }

  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

if (location.protocol === 'file:') {
  console.error('Use http://localhost:8000, not file://, for notifications.');
} else if ('serviceWorker' in navigator) {
  serviceWorkerReady = navigator.serviceWorker.register('./service-worker.js')
    .then((registration) => {
      notificationRegistration = registration;
      return navigator.serviceWorker.ready;
    })
    .catch((error) => {
      notificationRegistration = null;
      console.error('Service worker registration failed:', error);
      throw error;
    });
} else {
  console.error('Service workers are not supported in this browser.');
}

const state = {
  goal: '', reward: '', totalFocusMs: 0, breakIntervalMs: 0, breakDurationMs: 0, breaksEnabled: false,
  audioUrl: '', audioEnabled: false,
  focusElapsedMs: 0, focusSegmentStartedAt: 0, breakStartedAt: 0, breakElapsedMs: 0,
  nextBreakAtMs: 0, status: 'focus', orientation: 'horizontal', paused: false,
  milestones: new Set(), timerHandle: 0
};

function saveAudioSettings() {
  localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify({
    audioUrl: audioUrlInput.value.trim(),
    audioEnabled: audioToggle.checked
  }));
}

function restoreAudioSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY));
    if (!saved) return;
    audioUrlInput.value = typeof saved.audioUrl === 'string' ? saved.audioUrl : '';
    audioToggle.checked = saved.audioEnabled === true;
  } catch (error) {
    console.error('Saved audio settings restore failed:', error);
    localStorage.removeItem(AUDIO_SETTINGS_KEY);
  }
}

function getAudioUrl() {
  return audioUrlInput.value.trim();
}

function getAudioSelection() {
  const value = getAudioUrl();
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');

    const hostname = url.hostname.toLowerCase();
    let videoId = '';
    if (hostname === 'youtu.be') {
      videoId = url.pathname.slice(1).split('/')[0];
    } else if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
      if (url.pathname === '/watch') videoId = url.searchParams.get('v') || '';
      if (url.pathname.startsWith('/shorts/')) videoId = url.pathname.split('/')[2] || '';
    }
    if (videoId) {
      const validVideoId = videoId.match(/^[A-Za-z0-9_-]{11}/)?.[0];
      if (validVideoId) return { type: 'youtube', url: url.href, videoId: validVideoId };
      return { type: 'unsupported', url: url.href };
    }

    if (/\.(?:mp3|wav|ogg|oga|m4a|aac|flac|webm)(?:$|[?#])/i.test(url.pathname + url.search)) {
      return { type: 'direct', url: url.href };
    }
    return { type: 'unsupported', url: url.href };
  } catch {
    return { type: 'invalid', url: value };
  }
}

function showAudioMessage(message, isError = false) {
  audioMessage.textContent = message;
  audioMessage.classList.toggle('error', isError);
}

function stopUserAudio() {
  if (userAudio) {
    userAudio.pause();
    userAudio.currentTime = 0;
    userAudio = null;
  }
  if (youtubePlayer) {
    sendYouTubeCommand('pauseVideo');
    youtubePlayer.remove();
    youtubePlayer = null;
  }
  testingAudio = false;
  testAudioButton.innerHTML = 'TEST AUDIO <span aria-hidden="true">▶</span>';
}

function createYouTubePlayer(videoId, autoplay = false) {
  const player = document.createElement('iframe');
  const origin = location.origin === 'null' ? '' : `&origin=${encodeURIComponent(location.origin)}`;
  player.className = 'audio-player';
  player.title = 'Audio Link YouTube player';
  player.allow = 'autoplay; encrypted-media';
  player.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&playsinline=1&controls=0&rel=0&autoplay=${autoplay ? 1 : 0}${origin}`;
  player.addEventListener('load', () => {
    if (autoplay) sendYouTubeCommand('playVideo');
  }, { once: true });
  document.body.appendChild(player);
  youtubePlayer = player;
}

function sendYouTubeCommand(command) {
  if (!youtubePlayer?.contentWindow) return;
  youtubePlayer.contentWindow.postMessage(JSON.stringify({ event: 'command', func: command, args: [] }), '*');
}

function prepareUserAudio() {
  stopUserAudio();
  if (!audioToggle.checked) return false;
  const selection = getAudioSelection();
  if (selection.type === 'invalid') {
    showAudioMessage('Enter a valid http(s) audio URL to use Audio Link.', true);
    if (!timerScreen.classList.contains('hidden')) setStatus('AUDIO LINK IS INVALID — TIMER CONTINUES WITHOUT AUDIO');
    return false;
  }
  if (selection.type === 'unsupported') {
    showAudioMessage('Unsupported link. Use a YouTube video or a direct audio file URL.', true);
    if (!timerScreen.classList.contains('hidden')) setStatus('AUDIO LINK IS UNSUPPORTED — TIMER CONTINUES WITHOUT AUDIO');
    return false;
  }
  if (selection.type === 'youtube') {
    createYouTubePlayer(selection.videoId, true);
    return true;
  }
  userAudio = new Audio(selection.url);
  userAudio.preload = 'auto';
  userAudio.loop = true;
  userAudio.addEventListener('error', () => {
    stopUserAudio();
    showAudioMessage('This direct audio link could not be loaded. Check the URL or file format.', true);
    if (!timerScreen.classList.contains('hidden')) setStatus('AUDIO LINK COULD NOT LOAD — TIMER CONTINUES WITHOUT AUDIO');
  });
  return true;
}

function playUserAudio() {
  if (state.status !== 'focus' || state.paused) return;
  if (youtubePlayer) {
    sendYouTubeCommand('playVideo');
    return;
  }
  if (userAudio) userAudio.play().catch(() => {
    showAudioMessage('Direct audio playback was blocked by the browser. Use Test Audio or check site permissions.', true);
    if (!timerScreen.classList.contains('hidden')) setStatus('DIRECT AUDIO PLAYBACK WAS BLOCKED — TIMER CONTINUES');
  });
}

function pauseUserAudio() {
  if (userAudio) userAudio.pause();
  if (youtubePlayer) sendYouTubeCommand('pauseVideo');
}

function persistSession() {
  if (state.status === 'complete') {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
    goal: state.goal,
    reward: state.reward,
    totalFocusMs: state.totalFocusMs,
    breakIntervalMs: state.breakIntervalMs,
    breakDurationMs: state.breakDurationMs,
    breaksEnabled: state.breaksEnabled,
    focusElapsedMs: state.focusElapsedMs,
    focusSegmentStartedAt: state.focusSegmentStartedAt,
    breakStartedAt: state.breakStartedAt,
    breakElapsedMs: state.breakElapsedMs,
    nextBreakAtMs: state.nextBreakAtMs,
    status: state.status,
    orientation: state.orientation,
    paused: state.paused,
    milestones: [...state.milestones]
  }));
}

function restoreSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY));
    if (!saved?.totalFocusMs || !['focus', 'break'].includes(saved.status)) return false;
    Object.assign(state, saved, { milestones: new Set(saved.milestones || []) });
    goalDisplay.textContent = state.goal;
    rewardDisplay.textContent = state.reward;
    progressLayout.classList.toggle('vertical', state.orientation === 'vertical');
    progressLayout.classList.toggle('horizontal', state.orientation === 'horizontal');
    setupScreen.classList.add('hidden');
    completeScreen.classList.add('hidden');
    timerScreen.classList.remove('hidden');
    pauseButton.innerHTML = state.paused ? 'RESUME <span aria-hidden="true">▶</span>' : 'PAUSE <span aria-hidden="true">Ⅱ</span>';
    reconcileSession(Date.now());
    updateDisplay(Date.now());
    if (!state.paused) state.timerHandle = setTimeout(tick, 250);
    if (state.status === 'focus' && !state.paused && prepareUserAudio()) playUserAudio();
    if (isActiveSession()) void requestWakeLock();
    return true;
  } catch (error) {
    console.error('Saved session restore failed:', error);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return false;
  }
}

breakToggle.addEventListener('change', () => {
  breakIntervalInput.disabled = !breakToggle.checked;
  breakDurationInput.disabled = !breakToggle.checked;
});

audioUrlInput.addEventListener('input', saveAudioSettings);
audioToggle.addEventListener('change', () => {
  saveAudioSettings();
  if (!audioToggle.checked && testingAudio) stopUserAudio();
});
testAudioButton.addEventListener('click', () => {
  if (testingAudio) {
    stopUserAudio();
    return;
  }

  const selection = getAudioSelection();
  if (selection.type === 'invalid') {
    showAudioMessage('Enter a valid http(s) audio URL before testing it.', true);
    return;
  }
  if (selection.type === 'unsupported') {
    showAudioMessage('Unsupported link. Use a YouTube video or a direct audio file URL.', true);
    return;
  }

  stopUserAudio();
  testingAudio = true;
  testAudioButton.innerHTML = 'STOP TEST AUDIO <span aria-hidden="true">■</span>';
  showAudioMessage('Testing audio link...');
  if (selection.type === 'youtube') {
    createYouTubePlayer(selection.videoId, true);
    return;
  }
  userAudio = new Audio(selection.url);
  userAudio.addEventListener('error', () => {
    stopUserAudio();
    showAudioMessage('This direct audio link could not be loaded. Check the URL or file format.', true);
  });
  userAudio.addEventListener('ended', stopUserAudio, { once: true });
  userAudio.play().catch(() => {
    stopUserAudio();
    showAudioMessage('Direct audio playback was blocked by the browser. Try Test Audio again or check site permissions.', true);
  });
});

document.querySelectorAll('.orientation-button').forEach((button) => {
  button.addEventListener('click', () => {
    state.orientation = button.dataset.orientation;
    progressLayout.classList.toggle('vertical', state.orientation === 'vertical');
    progressLayout.classList.toggle('horizontal', state.orientation === 'horizontal');
    document.querySelectorAll('.orientation-button').forEach((item) => item.classList.toggle('active', item === button));
    updateDisplay(Date.now());
  });
});

setupForm.addEventListener('submit', (event) => {
  try {
    event.preventDefault();

    state.goal = goalInput.value.trim();
    state.reward = rewardInput.value.trim();
    state.totalFocusMs = Number(durationInput.value) * 60 * 1000;
    state.breaksEnabled = breakToggle.checked;
    state.breakIntervalMs = Number(breakIntervalInput.value) * 60 * 1000;
    state.breakDurationMs = Number(breakDurationInput.value) * 60 * 1000;
    state.audioUrl = audioUrlInput.value.trim();
    state.audioEnabled = audioToggle.checked;
    saveAudioSettings();
    state.focusElapsedMs = 0;
    state.nextBreakAtMs = state.breakIntervalMs;
    state.milestones = new Set();
    state.status = 'focus';
    state.paused = false;
    state.focusSegmentStartedAt = Date.now();
    persistSession();
    goalDisplay.textContent = state.goal;
    rewardDisplay.textContent = state.reward;
    setupScreen.classList.add('hidden');
    completeScreen.classList.add('hidden');
    timerScreen.classList.remove('hidden');
    pauseButton.innerHTML = 'PAUSE <span aria-hidden="true">Ⅱ</span>';
    statusStrip.classList.add('hidden');
    updateDisplay(Date.now());
    clearTimeout(state.timerHandle);
    state.timerHandle = setTimeout(tick, 250);
    if (prepareUserAudio()) playUserAudio();

    void requestWakeLock();
    void requestNotificationPermission();
    void unlockNotificationSound();
  } catch (error) {
    console.error('START FOCUS FAILED:', error);
    console.error(error.stack);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    void releaseWakeLock();
    return;
  }
  if (!state.totalFocusMs) return;
  const now = Date.now();
  reconcileSession(now);
  updateDisplay(now);
  if (state.status === 'focus' && getFocusElapsed(now) >= state.totalFocusMs) {
    finishSession();
    return;
  }
  if (isActiveSession()) void requestWakeLock();
});

pauseButton.addEventListener('click', () => {
  if (state.status !== 'focus') return;
  if (state.paused) {
    state.paused = false;
    state.focusSegmentStartedAt = Date.now();
    pauseButton.innerHTML = 'PAUSE <span aria-hidden="true">Ⅱ</span>';
    setStatus('FOCUS RESUMED');
    persistSession();
    state.timerHandle = setTimeout(tick, 250);
    playUserAudio();
    void requestWakeLock();
  } else {
    state.focusElapsedMs += Date.now() - state.focusSegmentStartedAt;
    state.paused = true;
    pauseButton.innerHTML = 'RESUME <span aria-hidden="true">▶</span>';
    setStatus('TIMER PAUSED — YOUR PROGRESS IS SAVED');
    persistSession();
    updateDisplay(Date.now());
    pauseUserAudio();
  }
});

stopButton.addEventListener('click', resetSession);

function resetSession() {
  clearTimeout(state.timerHandle);
  state.timerHandle = 0;
  stopUserAudio();
  notificationSound.pause();
  notificationSound.currentTime = 0;
  void releaseWakeLock();
  localStorage.removeItem(SESSION_STORAGE_KEY);

  Object.assign(state, {
    goal: '',
    reward: '',
    totalFocusMs: 0,
    breakIntervalMs: 0,
    breakDurationMs: 0,
    breaksEnabled: false,
    audioUrl: '',
    audioEnabled: false,
    focusElapsedMs: 0,
    focusSegmentStartedAt: 0,
    breakStartedAt: 0,
    breakElapsedMs: 0,
    nextBreakAtMs: 0,
    status: 'focus',
    orientation: 'horizontal',
    paused: false,
    milestones: new Set()
  });

  goalInput.value = '';
  durationInput.value = '25';
  rewardInput.value = '';
  breakToggle.checked = false;
  breakIntervalInput.value = '25';
  breakIntervalInput.disabled = true;
  breakDurationInput.value = '5';
  breakDurationInput.disabled = true;
  pauseButton.innerHTML = 'PAUSE <span aria-hidden="true">Ⅱ</span>';
  statusStrip.textContent = '';
  statusStrip.classList.add('hidden');
  breakModule.classList.add('hidden');
  focusProgress.style.width = '0%';
  focusProgress.style.height = '100%';
  breakProgress.style.width = '0%';
  breakProgress.style.height = '100%';
  focusPercent.textContent = '0%';
  breakPercent.textContent = '0%';
  timeLeft.textContent = '00:00';
  breakLeft.textContent = '00:00';
  progressLayout.classList.remove('vertical');
  progressLayout.classList.add('horizontal');
  document.querySelectorAll('.orientation-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.orientation === 'horizontal');
  });
  claimButton.disabled = false;
  claimButton.innerHTML = 'CLAIM REWARD <span aria-hidden="true">→</span>';
  claimedMessage.classList.add('hidden');
  setupScreen.classList.remove('hidden');
  timerScreen.classList.add('hidden');
  completeScreen.classList.add('hidden');
}

claimButton.addEventListener('click', async () => {
  if (claimButton.disabled) return;

  claimButton.disabled = true;
  claimButton.textContent = 'REWARD CLAIMED';
  claimedMessage.classList.remove('hidden');

  try {
    rewardSound.pause();
    rewardSound.currentTime = 0;
    await rewardSound.play();
  } catch (error) {
    console.error('Reward sound could not play:', error);
  }
});

function getFocusElapsed(now) {
  if (state.status === 'focus' && !state.paused) {
    return Math.min(state.totalFocusMs, state.focusElapsedMs + now - state.focusSegmentStartedAt);
  }
  return Math.min(state.totalFocusMs, state.focusElapsedMs);
}

function reconcileSession(now) {
  if (state.paused || state.status === 'complete') return;

  let transitions = 0;
  while (transitions++ < 100) {
    if (state.status === 'focus') {
      const currentFocus = state.focusElapsedMs + now - state.focusSegmentStartedAt;
      if (!state.breaksEnabled || state.nextBreakAtMs >= state.totalFocusMs || currentFocus < state.nextBreakAtMs) return;

      const breakStartedAt = state.focusSegmentStartedAt + (state.nextBreakAtMs - state.focusElapsedMs);
      state.focusElapsedMs = state.nextBreakAtMs;
      state.status = 'break';
      state.breakStartedAt = breakStartedAt;
      state.breakElapsedMs = Math.max(0, now - breakStartedAt);
      breakModule.classList.remove('hidden');
      setStatus('BREAK TIME — RESET YOUR CIRCUITS');
      pauseUserAudio();
      playNotificationSound();
      void requestWakeLock();
      notifyUser('Break time', 'Your focus segment is complete. Take a short break.');
      persistSession();
    }

    if (state.status === 'break') {
      state.breakElapsedMs = Math.min(state.breakDurationMs, Math.max(0, now - state.breakStartedAt));
      if (state.breakElapsedMs < state.breakDurationMs) return;

      state.focusSegmentStartedAt = state.breakStartedAt + state.breakDurationMs;
      state.status = 'focus';
      state.nextBreakAtMs += state.breakIntervalMs;
      breakModule.classList.add('hidden');
      setStatus('BREAK COMPLETE — BACK TO WORK');
      playUserAudio();
      playNotificationSound();
      void requestWakeLock();
      notifyUser('Break complete', 'Your next focus segment is ready.');
      persistSession();
    }
  }
}

function tick() {
  const now = Date.now();
  reconcileSession(now);
  updateDisplay(now);
  if (state.status === 'focus' && !state.paused && getFocusElapsed(now) >= state.totalFocusMs) { finishSession(); return; }
  // Background timers may be throttled, so tick uses timestamps and catches up after each wake-up.
  state.timerHandle = setTimeout(tick, 250);
}

function updateDisplay(now) {
  const focusElapsed = getFocusElapsed(now);
  const percentage = state.totalFocusMs ? (focusElapsed / state.totalFocusMs) * 100 : 0;
  const rounded = Math.round(percentage);
  if (state.orientation === 'vertical') {
    focusProgress.style.width = '100%';
    focusProgress.style.height = `${percentage}%`;
  } else {
    focusProgress.style.width = `${percentage}%`;
    focusProgress.style.height = '100%';
  }
  focusPercent.textContent = `${rounded}%`;
  timeLeft.textContent = formatTime(Math.max(0, state.totalFocusMs - focusElapsed));
  triggerMilestone(rounded);

  if (state.status === 'break') {
    state.breakElapsedMs = Math.min(state.breakDurationMs, Math.max(0, now - state.breakStartedAt));
    const breakPercentage = state.breakDurationMs ? (state.breakElapsedMs / state.breakDurationMs) * 100 : 0;
    if (state.orientation === 'vertical') {
      breakProgress.style.width = '100%';
      breakProgress.style.height = `${breakPercentage}%`;
    } else {
      breakProgress.style.width = `${breakPercentage}%`;
      breakProgress.style.height = '100%';
    }
    breakPercent.textContent = `${Math.round(breakPercentage)}%`;
    breakLeft.textContent = formatTime(Math.max(0, state.breakDurationMs - state.breakElapsedMs));
  }
}

async function unlockNotificationSound() {
  if (!notificationSound) return false;

  try {
    notificationSound.muted = true;
    notificationSound.volume = 0.001;
    notificationSound.currentTime = 0;
    await notificationSound.play().catch(() => {});
    notificationSound.pause();
    notificationSound.currentTime = 0;
    notificationSound.muted = false;
    notificationSound.volume = 0.65;
    return true;
  } catch (error) {
    console.warn('Could not unlock notification audio:', error);
    return false;
  }
}

function playNotificationSound() {
  if (!notificationSound || document.visibilityState !== 'visible') return false;

  try {
    notificationSound.pause();
    notificationSound.currentTime = 0;
    notificationSound.volume = 0.65;
    notificationSound.play().catch((error) => {
      console.warn('Milestone sound playback failed:', error);
    });
    return true;
  } catch (error) {
    console.warn('Milestone sound setup failed:', error);
    return false;
  }
}

function triggerMilestone(percentage) {
  [25, 50, 75, 100].forEach((milestone) => {
    if (percentage >= milestone && !state.milestones.has(milestone)) {
      state.milestones.add(milestone);
      const message = {
        25: '25% complete — Keep going!',
        50: "50% complete — You're halfway there!",
        75: '75% complete — Final stretch!',
        100: '100% complete — You did it!'
      }[milestone];
      setStatus(message.toUpperCase());
      notifyUser('Focus Timer', message, `focus-core-milestone-${milestone}`);
      playNotificationSound();
      persistSession();
    }
  });
}

function finishSession() {
  state.status = 'complete';
  state.focusElapsedMs = state.totalFocusMs;
  clearTimeout(state.timerHandle);
  stopUserAudio();
  void releaseWakeLock();
  completeGoal.textContent = state.goal;
  completeReward.textContent = state.reward;
  persistSession();
  timerScreen.classList.add('hidden');
  completeScreen.classList.remove('hidden');
}

function setStatus(message) {
  statusStrip.textContent = message;
  statusStrip.classList.remove('hidden');
}

async function notifyUser(title, message, tag = `focus-core-${Date.now()}`) {
  try {
    return await showDesktopNotification(title, message, tag);
  } catch (error) {
    console.error('Desktop notification failed:', error);
    return false;
  }
}

async function showDesktopNotification(title, message, tag) {
  if (!('Notification' in window)) {
    throw new Error('Notifications are not supported in this browser.');
  }
  if (Notification.permission !== 'granted') {
    throw new Error(`Notification permission is ${Notification.permission}. Enable it for this site in browser settings.`);
  }

  const registration = notificationRegistration || await (serviceWorkerReady || navigator.serviceWorker.ready);
  notificationRegistration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, {
    body: message,
    tag,
    renotify: true,
    silent: false,
    data: { url: './' }
  });
  return true;
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.error('Notifications are not supported in this browser.');
    return 'unsupported';
  }
  if (Notification.permission === 'default') {
    try {
      return await Notification.requestPermission();
    } catch (error) {
      console.error('Notification permission request failed:', error);
      return Notification.permission;
    }
  } else {
    return Notification.permission;
  }
}

function formatTime(milliseconds) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

restoreAudioSettings();
restoreSession();
