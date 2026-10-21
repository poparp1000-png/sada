import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * يغلّف Metered Video SDK (window.Metered) في هوك واحد.
 *
 * قناة التحكم: نرسل رسائل JSON عبر دردشة Metered (sendChatMessage) بعلامة __sada،
 * فتصل إلى الجميع دون خادم إضافي. تُستخدم لرفع اليد، المنصة (من يتحدث)، التفاعلات، والنص المباشر.
 * الرسائل النصية العادية (بلا العلامة) تُعامل كدردشة.
 */
const MARK = '__sada';

export function useMeeting({ roomURL, token, name, isHost = false, autoStart = {} }) {
  const mRef = useRef(null);
  const audioEls = useRef(new Map());
  const selfRef = useRef(null);
  const peopleRef = useRef({});
  const stageRef = useRef([]);
  const micStarted = useRef(false);
  const micRef = useRef(false);
  const camRef = useRef(false);
  const camIdx = useRef(0);
  const autoRef = useRef(autoStart);

  const [status, setStatus] = useState('joining');
  const [fatal, setFatal] = useState(null);
  const [notice, setNotice] = useState(null);
  const [selfId, setSelfId] = useState(null);
  const [people, setPeople] = useState({});      // id -> {id,name,isAdmin}
  const [streams, setStreams] = useState({});    // id -> MediaStream (فيديو)
  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [speakingAt, setSpeakingAt] = useState({});
  const [hands, setHands] = useState({});
  const [stage, setStageState] = useState([]);
  const [caption, setCaption] = useState(null);
  const [bursts, setBursts] = useState([]);
  const [lastChat, setLastChat] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { peopleRef.current = people; }, [people]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 400); return () => clearInterval(t); }, []);

  const notify = useCallback((text) => setNotice({ text, k: Date.now() }), []);

  const send = useCallback((payload) => {
    try { mRef.current?.sendChatMessage(JSON.stringify({ [MARK]: 1, ...payload })); } catch { /* غير متصل */ }
  }, []);

  const pushBurst = useCallback((e) => {
    const b = { id: Math.random().toString(36).slice(2), e, x: 10 + Math.random() * 80 };
    setBursts((p) => [...p.slice(-12), b]);
    setTimeout(() => setBursts((p) => p.filter((x) => x.id !== b.id)), 2600);
  }, []);

  /* ───── وسائط محلية ───── */
  const toggleMic = useCallback(async (force) => {
    const m = mRef.current;
    if (!m) return;
    const want = force ?? !micRef.current;
    try {
      if (want) {
        if (!micStarted.current) { await m.startAudio(); micStarted.current = true; }
        else m.unmuteLocalAudio();
      } else if (micStarted.current) {
        await m.muteLocalAudio();
      }
      micRef.current = want;
      setMicOn(want);
    } catch {
      notify('تعذّر تشغيل الميكروفون. تحقق من أذونات المتصفح.');
    }
  }, [notify]);

  const toggleCam = useCallback(async (force) => {
    const m = mRef.current;
    if (!m) return;
    const want = force ?? !camRef.current;
    try {
      if (want) await m.startVideo(); else await m.stopVideo();
      camRef.current = want;
      setCamOn(want);
    } catch {
      notify('تعذّر تشغيل الكاميرا. تحقق من أذونات المتصفح.');
    }
  }, [notify]);

  const flipCam = useCallback(async () => {
    const m = mRef.current;
    try {
      const cams = await m.listVideoInputDevices();
      if (cams.length < 2) return notify('لا توجد كاميرا أخرى في هذا الجهاز.');
      camIdx.current = (camIdx.current + 1) % cams.length;
      await m.chooseVideoInputDevice(cams[camIdx.current].deviceId);
    } catch { notify('تعذّر تبديل الكاميرا.'); }
  }, [notify]);

  const shareScreen = useCallback(async () => {
    try { await mRef.current.startScreenShare(); camRef.current = true; setCamOn(true); }
    catch { notify('تعذّرت مشاركة الشاشة.'); }
  }, [notify]);

  /* ───── تحكم الغرفة ───── */
  const toggleHand = useCallback(() => {
    const id = selfRef.current;
    const v = !hands[id];
    setHands((p) => ({ ...p, [id]: v }));
    send({ t: 'hand', v });
  }, [hands, send]);

  const setStage = useCallback((ids) => {
    stageRef.current = ids;
    setStageState(ids);
    send({ t: 'stage', ids });
  }, [send]);

  const react = useCallback((e) => { pushBurst(e); send({ t: 'react', e }); }, [pushBurst, send]);
  const sendText = useCallback((text) => {
    const t = text.trim();
    if (!t) return;
    try { mRef.current.sendChatMessage(t); } catch { return; }
    setLastChat({ name: 'أنت', text: t, at: Date.now() });
  }, []);
  const sendCaption = useCallback((text) => {
    send({ t: 'cc', text });
    setCaption({ id: selfRef.current, name: 'أنت', text, at: Date.now() });
  }, [send]);

  /* ───── الانضمام ───── */
  useEffect(() => {
    if (!roomURL || !window.Metered) {
      if (!window.Metered) { setFatal('SDK_MISSING'); setStatus('failed'); }
      return undefined;
    }
    let dead = false;
    const meeting = new window.Metered.Meeting();
    mRef.current = meeting;

    const toPerson = (p) => ({ id: p._id, name: p.name, isAdmin: !!p.isAdmin });
    const dropKey = (obj, k) => { const n = { ...obj }; delete n[k]; return n; };

    const applyControl = (fromId, fromName, d) => {
      if (d.t === 'hand') setHands((p) => ({ ...p, [fromId]: !!d.v }));
      else if (d.t === 'react') pushBurst(d.e);
      else if (d.t === 'cc') setCaption({ id: fromId, name: fromName, text: String(d.text).slice(0, 240), at: Date.now() });
      else if (d.t === 'stage') {
        if (!peopleRef.current[fromId]?.isAdmin) return; // المضيف فقط يحدد المنصة
        const ids = Array.isArray(d.ids) ? d.ids : [];
        const wasOn = stageRef.current.includes(selfRef.current);
        stageRef.current = ids;
        setStageState(ids);
        if (!wasOn && ids.includes(selfRef.current)) {
          setHands((p) => ({ ...p, [selfRef.current]: false }));
          notify('دعاك المضيف للتحدث. اضغط على الميكروفون.');
        }
      }
    };

    meeting.on('participantJoined', (p) => {
      setPeople((prev) => ({ ...prev, [p._id]: toPerson(p) }));
      if (isHost) setTimeout(() => send({ t: 'stage', ids: stageRef.current }), 800); // عرّف القادم الجديد بالمنصة
    });
    meeting.on('participantLeft', (p) => {
      setPeople((prev) => dropKey(prev, p._id));
      setStreams((prev) => dropKey(prev, p._id));
      setHands((prev) => dropKey(prev, p._id));
    });
    meeting.on('onlineParticipants', (list) => {
      setPeople((prev) => {
        const next = Object.fromEntries(list.map((p) => [p._id, toPerson(p)]));
        if (selfRef.current && !next[selfRef.current]) next[selfRef.current] = prev[selfRef.current] || { id: selfRef.current, name, isAdmin: isHost };
        return next;
      });
    });

    meeting.on('remoteTrackStarted', (t) => {
      const stream = new MediaStream([t.track]);
      if (t.type === 'audio') {
        const el = document.createElement('audio');
        el.autoplay = true;
        el.srcObject = stream;
        document.body.appendChild(el);
        el.play().catch(() => {}); // قد يرفضها iOS حتى أول لمسة، وسنعيد المحاولة في unlock
        audioEls.current.set(t.streamId, el);
      } else {
        setStreams((prev) => ({ ...prev, [t.participantSessionId]: stream }));
      }
    });
    meeting.on('remoteTrackStopped', (t) => {
      if (t.type === 'audio') {
        audioEls.current.get(t.streamId)?.remove();
        audioEls.current.delete(t.streamId);
      } else {
        setStreams((prev) => dropKey(prev, t.participantSessionId));
      }
    });

    const onLocalVideo = (t) => { if (t.type === 'video') setLocalStream(new MediaStream([t.track])); };
    meeting.on('localTrackStarted', onLocalVideo);
    meeting.on('localTrackUpdated', onLocalVideo);
    meeting.on('localTrackStopped', (t) => { if (t.type === 'video') setLocalStream(null); });

    meeting.on('activeSpeaker', (s) => setSpeakingAt((p) => ({ ...p, [s.participantSessionId]: Date.now() })));
    meeting.on('stateChanged', (s) => setStatus(s));
    meeting.on('meetingEnded', () => setStatus('terminated'));

    meeting.on('chatMessageReceived', (m) => {
      let data = null;
      try { data = JSON.parse(m.content); } catch { /* نص عادي */ }
      if (data && data[MARK]) {
        if (m.senderParticipantSessionId === selfRef.current) return; // طبّقناها محلياً
        applyControl(m.senderParticipantSessionId, m.senderName, data);
      } else if (m.senderParticipantSessionId !== selfRef.current) {
        setLastChat({ name: m.senderName, text: String(m.content).slice(0, 200), at: Date.now() });
      }
    });

    // iOS Safari: لا يبدأ تشغيل الصوت إلا بعد لمسة، فنعيد تشغيل العناصر عند أول لمسة
    const unlock = () => audioEls.current.forEach((el) => el.play().catch(() => {}));
    document.addEventListener('pointerdown', unlock);

    (async () => {
      try {
        const info = await meeting.join({ roomURL, name, accessToken: token });
        if (dead) { meeting.leaveMeeting().catch(() => {}); return; }
        selfRef.current = info.participantSessionId;
        setSelfId(info.participantSessionId);
        const map = Object.fromEntries((info.onlineParticipants || []).map((p) => [p._id, toPerson(p)]));
        map[info.participantSessionId] = { id: info.participantSessionId, name, isAdmin: isHost };
        setPeople(map);
        setStatus('joined');
        if (autoRef.current.audio) await toggleMic(true);
        if (autoRef.current.video) await toggleCam(true);
      } catch (e) {
        if (!dead) { setFatal(e?.message || 'JOIN_FAILED'); setStatus('failed'); }
      }
    })();

    return () => {
      dead = true;
      document.removeEventListener('pointerdown', unlock);
      audioEls.current.forEach((el) => el.remove());
      audioEls.current.clear();
      // نوقف المسارات صراحةً قبل المغادرة كي تنطفئ أيقونة الميكروفون في أندرويد
      (async () => {
        try { await meeting.stopVideo?.(); } catch { /* لم تبدأ */ }
        try { await meeting.stopAudio?.(); } catch { /* لم تبدأ */ }
        try { await meeting.leaveMeeting(); } catch { /* غادر بالفعل */ }
      })();
      mRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomURL, token, name]);

  const isSpeaking = useCallback((id) => now - (speakingAt[id] || 0) < 1200, [now, speakingAt]);

  return {
    status, fatal, notice, selfId, people, streams, localStream,
    micOn, camOn, hands, stage, caption, bursts, lastChat, now,
    isSpeaking, toggleMic, toggleCam, flipCam, shareScreen,
    toggleHand, setStage, react, sendText, sendCaption,
  };
}
