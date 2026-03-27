import React, { useEffect, useMemo, useRef, useState } from 'react'
import './AppWizard.css'

type AudioClip = {
  url: string
  blob: Blob
}

type PhotoDraft = {
  id: string
  file: File
  previewUrl: string
  note?: string
  audioQ1: AudioClip | null
  audioQ2: AudioClip | null
}

type Step = 0 | 1 | 2 | 3 | 4 | 5
type PhotoSubStep = 'q1' | 'q2'

function uid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (crypto as any).randomUUID() as string
  }
  return Math.random().toString(36).slice(2)
}

function getSupportedMimeType(): string | undefined {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ]
  if (typeof MediaRecorder === 'undefined') return undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MR = MediaRecorder as any
  for (const candidate of candidates) {
    if (MR.isTypeSupported?.(candidate)) return candidate
  }
  return undefined
}

function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`
}

function stopAllTracks(stream: MediaStream | null) {
  if (!stream) return
  stream.getTracks().forEach((t) => t.stop())
}

function AudioCapture({
  clip,
  title,
  prompt,
  maxSeconds = 90,
  onSaved,
  onClear,
}: {
  clip: AudioClip | null
  title: string
  prompt?: string
  maxSeconds?: number
  onSaved: (clip: AudioClip) => void
  onClear: () => void
}) {
  const [recStatus, setRecStatus] = useState<'idle' | 'recording' | 'error'>(
    'idle',
  )
  const [errorText, setErrorText] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)

  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      stopAllTracks(streamRef.current)
    }
  }, [])

  useEffect(() => {
    setErrorText(null)
    setElapsed(0)
    setIsPlaying(false)

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    // When a clip exists, we show preview controls instead of recording.
    setRecStatus(clip ? 'idle' : 'idle')
  }, [clip?.url])

  const toggleRecord = async () => {
    setErrorText(null)

    if (recStatus === 'recording') {
      mediaRecorderRef.current?.stop()
      return
    }

    try {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        setRecStatus('error')
        setErrorText('Microphone access is not supported in this browser.')
        return
      }
      if (typeof MediaRecorder === 'undefined') {
        setRecStatus('error')
        setErrorText('MediaRecorder is not available in this browser.')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = getSupportedMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e: BlobEvent) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onerror = () => {
        setRecStatus('error')
        setErrorText('Recording failed. Please try again.')
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType ?? recorder.mimeType ?? 'audio/webm',
        })
        const url = URL.createObjectURL(blob)
        onSaved({ url, blob })

        stopAllTracks(streamRef.current)
        streamRef.current = null
        mediaRecorderRef.current = null
        chunksRef.current = []

        if (timerRef.current) window.clearInterval(timerRef.current)
        timerRef.current = null
        setElapsed(0)
        setRecStatus('idle')
      }

      recorder.start()
      setRecStatus('recording')

      const start = Date.now()
      timerRef.current = window.setInterval(() => {
        const seconds = (Date.now() - start) / 1000
        setElapsed(seconds)
        if (seconds >= maxSeconds) recorder.stop()
      }, 200)
    } catch {
      setRecStatus('error')
      setErrorText('Microphone permission was denied or unavailable.')
    }
  }

  const togglePreview = async () => {
    if (!clip) return
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(clip.url)
        audioRef.current.onended = () => setIsPlaying(false)
      } else if (audioRef.current.src !== clip.url) {
        audioRef.current.src = clip.url
      }

      if (isPlaying) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        setIsPlaying(false)
      } else {
        await audioRef.current.play()
        setIsPlaying(true)
      }
    } catch {
      setErrorText('Unable to play audio preview.')
    }
  }

  return (
    <div className="mw-card">
      <div className="mw-stack">
        <div className="mw-title">{title}</div>
        {prompt ? <div className="mw-muted">{prompt}</div> : null}

        {clip ? (
          <div className="mw-audioControls">
            <button
              className="mw-button mw-buttonPrimary"
              type="button"
              onClick={togglePreview}
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button
              className="mw-button mw-buttonSecondary"
              type="button"
              onClick={() => {
                if (audioRef.current) {
                  audioRef.current.pause()
                  audioRef.current.currentTime = 0
                }
                setIsPlaying(false)
                onClear()
              }}
            >
              Retake
            </button>
          </div>
        ) : (
          <div className="mw-recordPanel">
            <button
              className={`mw-recordButton ${
                recStatus === 'recording' ? 'mw-recording' : ''
              }`}
              type="button"
              onClick={toggleRecord}
              aria-pressed={recStatus === 'recording'}
            >
              {recStatus === 'recording' ? 'Stop' : 'Record'}
            </button>
            <div className="mw-timerLine">
              <span className="mw-muted">{formatTime(elapsed)}</span>
              <span className="mw-muted"> / up to {formatTime(maxSeconds)}</span>
            </div>
            {errorText ? <div className="mw-error">{errorText}</div> : null}
          </div>
        )}
      </div>
    </div>
  )
}

function AudioProgressBar({ progress }: { progress: number }) {
  return (
    <div className="mw-progressWrap" aria-hidden="true">
      <div
        className="mw-progressBar"
        style={{ width: `${Math.min(1, Math.max(0, progress)) * 100}%` }}
      />
    </div>
  )
}

export default function AppWizard() {
  const MAX_PHOTOS = 10

  const [step, setStep] = useState<Step>(0)
  const [photos, setPhotos] = useState<PhotoDraft[]>([])
  const [introAudio, setIntroAudio] = useState<AudioClip | null>(null)
  const [introNote, setIntroNote] = useState('')
  const [introNoteOpen, setIntroNoteOpen] = useState(false)

  const [photoIndex, setPhotoIndex] = useState(0)
  const [photoSubStep, setPhotoSubStep] = useState<PhotoSubStep>('q1')
  const [noteOpen, setNoteOpen] = useState(false)

  const [flipIndex, setFlipIndex] = useState(0)
  const [flipPlaying, setFlipPlaying] = useState(false)
  const [flipProgress, setFlipProgress] = useState(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queueRef = useRef<AudioClip[]>([])
  const queueIdxRef = useRef(0)

  const [reviewPlayingKey, setReviewPlayingKey] = useState<string | null>(
    null,
  )
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null)
  const reviewQueueRef = useRef<AudioClip[]>([])
  const reviewQueueIdxRef = useRef(0)
  const [reviewProgress, setReviewProgress] = useState(0)

  const pages = useMemo(() => ({ pageCount: photos.length + 1 }), [photos.length])

  const currentPhoto = photos[photoIndex] ?? null
  const currentClip =
    photoSubStep === 'q1' ? currentPhoto?.audioQ1 ?? null : currentPhoto?.audioQ2 ?? null

  const clearDraft = () => {
    for (const p of photos) {
      URL.revokeObjectURL(p.previewUrl)
      if (p.audioQ1) URL.revokeObjectURL(p.audioQ1.url)
      if (p.audioQ2) URL.revokeObjectURL(p.audioQ2.url)
    }
    if (introAudio) URL.revokeObjectURL(introAudio.url)

    setPhotos([])
    setIntroAudio(null)
    setIntroNote('')
    setIntroNoteOpen(false)
    setPhotoIndex(0)
    setPhotoSubStep('q1')
    setNoteOpen(false)
    setFlipIndex(0)
    setFlipPlaying(false)
    setFlipProgress(0)
    setReviewPlayingKey(null)
    setReviewProgress(0)

    queueRef.current = []
    queueIdxRef.current = 0
    reviewQueueRef.current = []
    reviewQueueIdxRef.current = 0

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.src = ''
    }
    if (reviewAudioRef.current) {
      reviewAudioRef.current.pause()
      reviewAudioRef.current.currentTime = 0
      reviewAudioRef.current.src = ''
    }

    setStep(0)
  }

  useEffect(() => {
    if (step !== 5) {
      setFlipPlaying(false)
      setFlipProgress(0)
      queueRef.current = []
      queueIdxRef.current = 0
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current.src = ''
      }
    }
  }, [step])

  useEffect(() => {
    if (step !== 4) {
      setReviewPlayingKey(null)
      setReviewProgress(0)
      reviewQueueRef.current = []
      reviewQueueIdxRef.current = 0
      if (reviewAudioRef.current) {
        reviewAudioRef.current.pause()
        reviewAudioRef.current.currentTime = 0
        reviewAudioRef.current.src = ''
      }
    }
  }, [step])

  const stopFlipAudio = () => {
    setFlipPlaying(false)
    setFlipProgress(0)
    queueRef.current = []
    queueIdxRef.current = 0
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current.src = ''
    }
  }

  useEffect(() => {
    if (step === 5) stopFlipAudio()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipIndex])

  const getFlipPageClips = (): AudioClip[] => {
    if (flipIndex === 0) return introAudio ? [introAudio] : []
    const photo = photos[flipIndex - 1]
    if (!photo) return []
    return [photo.audioQ1, photo.audioQ2].filter((c): c is AudioClip => Boolean(c))
  }

  const playFlipAudio = async () => {
    const clips = getFlipPageClips()
    if (clips.length === 0) return

    queueRef.current = clips
    queueIdxRef.current = 0

    const audio = audioRef.current ?? new Audio()
    audioRef.current = audio

    audio.onended = () => {
      const nextIdx = queueIdxRef.current + 1
      if (nextIdx >= queueRef.current.length) {
        setFlipPlaying(false)
        setFlipProgress(0)
        queueIdxRef.current = 0
        queueRef.current = []
        return
      }
      queueIdxRef.current = nextIdx
      const nextClip = queueRef.current[nextIdx]
      audio.src = nextClip.url
      setFlipProgress(0)
      void audio.play()
    }

    audio.ontimeupdate = () => {
      if (!audio.duration || Number.isNaN(audio.duration)) return
      setFlipProgress(audio.currentTime / audio.duration)
    }

    setFlipPlaying(true)
    setFlipProgress(0)
    audio.src = clips[0].url
    audio.currentTime = 0
    await audio.play()
  }

  const toggleFlipPlay = async () => {
    if (flipPlaying) {
      stopFlipAudio()
      return
    }
    stopFlipAudio()
    await playFlipAudio()
  }

  const saveCurrentClip = (clip: AudioClip) => {
    setPhotos((prev) =>
      prev.map((p, i) => {
        if (i !== photoIndex) return p
        if (photoSubStep === 'q1') return { ...p, audioQ1: clip }
        return { ...p, audioQ2: clip }
      }),
    )
  }

  const clearAudioForQuestion = (q: PhotoSubStep) => {
    setPhotos((prev) =>
      prev.map((p, i) => {
        if (i !== photoIndex) return p
        if (q === 'q1') return { ...p, audioQ1: null }
        return { ...p, audioQ2: null }
      }),
    )
  }

  const playReviewQueue = async (key: string, clips: AudioClip[]) => {
    if (clips.length === 0) return

    if (reviewPlayingKey === key) {
      setReviewPlayingKey(null)
      setReviewProgress(0)
      reviewQueueRef.current = []
      reviewQueueIdxRef.current = 0
      if (reviewAudioRef.current) {
        reviewAudioRef.current.pause()
        reviewAudioRef.current.currentTime = 0
        reviewAudioRef.current.src = ''
      }
      return
    }

    setReviewPlayingKey(key)
    setReviewProgress(0)
    reviewQueueRef.current = clips
    reviewQueueIdxRef.current = 0

    const audio = reviewAudioRef.current ?? new Audio()
    reviewAudioRef.current = audio

    audio.onended = () => {
      const nextIdx = reviewQueueIdxRef.current + 1
      if (nextIdx >= reviewQueueRef.current.length) {
        setReviewPlayingKey(null)
        setReviewProgress(0)
        reviewQueueIdxRef.current = 0
        reviewQueueRef.current = []
        return
      }
      reviewQueueIdxRef.current = nextIdx
      audio.src = reviewQueueRef.current[nextIdx].url
      setReviewProgress(0)
      void audio.play()
    }

    audio.ontimeupdate = () => {
      if (!audio.duration || Number.isNaN(audio.duration)) return
      setReviewProgress(audio.currentTime / audio.duration)
    }

    audio.src = clips[0].url
    audio.currentTime = 0
    await audio.play()
  }

  const headerText = useMemo(() => {
    switch (step) {
      case 0:
        return 'Create a memory bin'
      case 1:
        return 'Upload your memories'
      case 2:
        return 'Cover narration (optional)'
      case 3:
        return `Record audio (Photo ${photoIndex + 1} of ${photos.length})`
      case 4:
        return 'Review & create your flipbook'
      case 5:
        return 'Your narrated flipbook'
      default:
        return 'garage'
    }
  }, [step, photoIndex, photos.length])

  return (
    <div className="mw-page">
      <div className="mw-shell">
          <div className="mw-topBar">
          <div className="mw-brand">
            <svg
              className="mw-boxDoodle"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              {/* Open cardboard box doodle */}
              <path
                d="M9 9L12 7L15 9"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M12 7V13"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M9 13H15"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M7 11H17"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M7 11V20"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M7 20H17"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M17 11V20"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
              <span>garage</span>
          </div>
          <div className="mw-topBarRight">
            {step !== 0 ? (
              <button className="mw-linkButton" type="button" onClick={clearDraft}>
                Start over
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>

        {step === 0 ? (
          <div className="mw-header mw-headerHome">
            <div className="mw-homeGarage">garage</div>
            <div className="mw-homeTagline">turn storage into stories</div>
            <div className="mw-homeTitle">
              create a memory flipbook for your family members
            </div>
          </div>
        ) : (
          <div className="mw-header">{headerText}</div>
        )}

        {step === 0 ? (
          <div className="mw-gridOne">
            <div className="mw-heroCard">
              <div className="mw-heroTitle">Turn memories into a narrated flipbook</div>
              <div className="mw-heroSub">
                Upload up to 10 photos. Record two required audio clips per photo. (Q1 then Q2.)
              </div>
              <div className="mw-actionsRow">
                <button
                  className="mw-button mw-buttonPrimary mw-buttonBig"
                  type="button"
                  onClick={() => {
                    clearDraft()
                    setStep(1)
                  }}
                >
                  Create a memory bin
                </button>
              </div>
              <div className="mw-mutedSmall">A cover narration is optional.</div>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="mw-gridTwo">
            <div className="mw-card mw-cardTall">
              <div className="mw-stack">
                <div className="mw-title">Choose up to {MAX_PHOTOS} photos</div>
                <div className="mw-dropRow">
                  <label className="mw-dropzone">
                    <input
                      className="mw-fileInput"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const files = e.target.files ? Array.from(e.target.files) : []
                        if (files.length === 0) return
                        setPhotos((prev) => {
                          const spaceLeft = MAX_PHOTOS - prev.length
                          const toAdd = files.slice(0, Math.max(0, spaceLeft))
                          const next = [...prev]
                          for (const file of toAdd) {
                            const previewUrl = URL.createObjectURL(file)
                            next.push({
                              id: uid(),
                              file,
                              previewUrl,
                              note: '',
                              audioQ1: null,
                              audioQ2: null,
                            })
                          }
                          return next
                        })
                        e.currentTarget.value = ''
                      }}
                    />
                    <div className="mw-dropzoneInner">
                      <div className="mw-dropTitle">Click to upload</div>
                      <div className="mw-mutedSmall">or drag files later (MVP)</div>
                    </div>
                  </label>
                </div>

                <div className="mw-mutedSmall">
                  Selected: {photos.length} / {MAX_PHOTOS}
                </div>

                <div className="mw-actionsRow">
                  <button
                    className="mw-button mw-buttonSecondary"
                    type="button"
                    onClick={() => setStep(0)}
                  >
                    Back
                  </button>
                  <button
                    className="mw-button mw-buttonPrimary"
                    type="button"
                    disabled={photos.length === 0}
                    onClick={() => setStep(2)}
                  >
                    Continue
                  </button>
                </div>
              </div>
            </div>

            <div className="mw-card mw-cardTall">
              <div className="mw-stack">
                <div className="mw-title">Your selected photos</div>
                <div className="mw-thumbGrid">
                  {photos.map((p) => (
                    <div key={p.id} className="mw-thumbCard">
                      <img src={p.previewUrl} alt="" className="mw-thumbImg" />
                      <button
                        type="button"
                        className="mw-thumbRemove"
                        onClick={() => {
                          setPhotos((prev) => prev.filter((x) => x.id !== p.id))
                          URL.revokeObjectURL(p.previewUrl)
                          if (p.audioQ1) URL.revokeObjectURL(p.audioQ1.url)
                          if (p.audioQ2) URL.revokeObjectURL(p.audioQ2.url)
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                {photos.length > 0 ? (
                  <div className="mw-mutedSmall">
                    You can replace audio later from the review screen.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mw-gridOne">
            <div className="mw-gridTwo">
              <div className="mw-card mw-cardTall">
                <div className="mw-stack">
                  <div className="mw-title">Optional</div>
                  <div className="mw-heroSub">Add a short intro narration for the cover page.</div>
                  <div className="mw-mutedSmall">If you skip, the cover will have no audio.</div>
                </div>
              </div>
              <div>
                <AudioCapture
                  clip={introAudio}
                  title="Cover narration"
                  prompt="Tell the story's beginning..."
                  onSaved={(clip) => setIntroAudio(clip)}
                  onClear={() => setIntroAudio(null)}
                />

                <div className="mw-actionsRow">
                  <button
                    className="mw-button mw-buttonSecondary"
                    type="button"
                    onClick={() => setStep(1)}
                  >
                    Back
                  </button>
                  <button
                    className="mw-button mw-buttonPrimary"
                    type="button"
                    onClick={() => {
                      setPhotoIndex(0)
                      setPhotoSubStep('q1')
                      setNoteOpen(false)
                      setStep(3)
                    }}
                  >
                    Next
                  </button>
                </div>

                <button
                  className="mw-linkButton mw-mt12"
                  type="button"
                  onClick={() => setIntroNoteOpen((v) => !v)}
                >
                  {introNoteOpen ? 'Hide note (optional)' : 'Add a note (optional)'}
                </button>
                {introNoteOpen ? (
                  <div className="mw-field">
                    <label className="mw-label">One sentence intro note</label>
                    <textarea
                      className="mw-textarea"
                      rows={3}
                      value={introNote}
                      onChange={(e) => setIntroNote(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                ) : null}

                <button
                  className="mw-linkButton mw-mt8"
                  type="button"
                  onClick={() => {
                    setIntroAudio(null)
                    setIntroNoteOpen(false)
                    setPhotoIndex(0)
                    setPhotoSubStep('q1')
                    setNoteOpen(false)
                    setStep(3)
                  }}
                >
                  Skip for now
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mw-gridOne">
            <div className="mw-photoStepTop">
              <div className="mw-mutedSmall">
                Photo {photoIndex + 1} of {photos.length}
              </div>
              <div className="mw-mutedSmall">
                Question {photoSubStep === 'q1' ? '1 of 2' : '2 of 2'} (Q2 required)
              </div>
            </div>

            {currentPhoto ? (
              <div className="mw-gridTwo">
                <div className="mw-card mw-cardTall">
                  <img
                    src={currentPhoto.previewUrl}
                    alt=""
                    className="mw-photoPreview"
                  />
                  <div className="mw-mutedSmall mw-mt12">
                    Record Q1 then Q2 for this photo.
                  </div>
                </div>

                <div>
                  <AudioCapture
                    clip={currentClip}
                    title={photoSubStep === 'q1' ? 'Question 1' : 'Question 2'}
                    prompt={
                      photoSubStep === 'q1'
                        ? 'Whats the story here'
                        : 'What do you want your children to remember about this moment'
                    }
                    onSaved={(clip) => saveCurrentClip(clip)}
                    onClear={() => clearAudioForQuestion(photoSubStep)}
                  />

                  <div className="mw-actionsRow">
                    <button
                      className="mw-button mw-buttonSecondary"
                      type="button"
                      disabled={photoSubStep === 'q1'}
                      onClick={() => setPhotoSubStep('q1')}
                    >
                      Previous
                    </button>

                    {photoSubStep === 'q1' ? (
                      <button
                        className="mw-button mw-buttonPrimary"
                        type="button"
                        disabled={!currentPhoto.audioQ1}
                        onClick={() => setPhotoSubStep('q2')}
                      >
                        Save Q1 & record Q2
                      </button>
                    ) : (
                      <button
                        className="mw-button mw-buttonPrimary"
                        type="button"
                        disabled={!currentPhoto.audioQ2}
                        onClick={() => {
                          const isLast = photoIndex >= photos.length - 1
                          if (isLast) setStep(4)
                          else {
                            setPhotoIndex((i) => i + 1)
                            setPhotoSubStep('q1')
                            setNoteOpen(false)
                          }
                        }}
                      >
                        {photoIndex >= photos.length - 1
                          ? 'Review flipbook'
                          : 'Save & next photo'}
                      </button>
                    )}
                  </div>

                  <button
                    className="mw-linkButton mw-mt12"
                    type="button"
                    onClick={() => setNoteOpen((v) => !v)}
                  >
                    {noteOpen ? 'Hide note (optional)' : 'Add a note (optional)'}
                  </button>
                  {noteOpen ? (
                    <div className="mw-field">
                      <label className="mw-label">Any extra context (optional)</label>
                      <textarea
                        className="mw-textarea"
                        rows={3}
                        value={currentPhoto.note ?? ''}
                        onChange={(e) => {
                          const value = e.target.value
                          setPhotos((prev) =>
                            prev.map((p, i) => {
                              if (i !== photoIndex) return p
                              return { ...p, note: value }
                            }),
                          )
                        }}
                        placeholder="Optional"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mw-card">No photo selected.</div>
            )}
          </div>
        ) : null}

        {step === 4 ? (
          <div className="mw-gridOne">
            <div className="mw-actionsRow mw-actionsRowTight">
              <button
                className="mw-button mw-buttonSecondary"
                type="button"
                onClick={() => setStep(1)}
              >
                Back to photos
              </button>
            </div>

            <div className="mw-card">
              <div className="mw-title">Flipbook pages</div>
              <div className="mw-pageList">
                {introAudio ? (
                  <div className="mw-pageCard">
                    <div className="mw-pageCardLeft">
                      <div className="mw-coverBadge">Cover</div>
                      {introNote.trim() ? (
                        <div className="mw-mutedSmall mw-mt8">
                          {introNote.trim()}
                        </div>
                      ) : null}
                    </div>
                    <div className="mw-pageCardRight">
                      <div className="mw-pageStatus">Intro: Recorded</div>
                      <div className="mw-inlineActions">
                        <button
                          className="mw-button mw-buttonSecondary mw-buttonSmall"
                          type="button"
                          onClick={() =>
                            void playReviewQueue('cover', [introAudio])
                          }
                        >
                          {reviewPlayingKey === 'cover' ? 'Pause' : 'Play'}
                        </button>
                        <button
                          className="mw-button mw-buttonSecondary mw-buttonSmall"
                          type="button"
                          onClick={() => setStep(2)}
                        >
                          Replace
                        </button>
                      </div>
                      {reviewPlayingKey === 'cover' ? (
                        <AudioProgressBar progress={reviewProgress} />
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {photos.map((p, idx) => {
                  const key = `photo-${idx}`
                  const clips = [p.audioQ1, p.audioQ2].filter(
                    (c): c is AudioClip => Boolean(c),
                  )
                  return (
                    <div key={p.id} className="mw-pageCard">
                      <div className="mw-pageCardLeft">
                        <img src={p.previewUrl} alt="" className="mw-pageThumb" />
                        <div className="mw-mutedSmall">
                          Page {idx + 1}
                          {p.note?.trim() ? (
                            <div className="mw-mutedSmall mw-mt8">{p.note.trim()}</div>
                          ) : null}
                        </div>
                      </div>
                      <div className="mw-pageCardRight">
                        <div className="mw-pageStatus">
                          Q1: Recorded · Q2: Recorded
                        </div>
                        <div className="mw-inlineActions">
                          <button
                            className="mw-button mw-buttonSecondary mw-buttonSmall"
                            type="button"
                            onClick={() => void playReviewQueue(key, clips)}
                          >
                            {reviewPlayingKey === key ? 'Pause' : 'Play'}
                          </button>
                          <button
                            className="mw-button mw-buttonSecondary mw-buttonSmall"
                            type="button"
                            onClick={() => {
                              setPhotoIndex(idx)
                              setPhotoSubStep('q1')
                              setNoteOpen(false)
                              setStep(3)
                            }}
                          >
                            Replace Q1
                          </button>
                          <button
                            className="mw-button mw-buttonSecondary mw-buttonSmall"
                            type="button"
                            onClick={() => {
                              setPhotoIndex(idx)
                              setPhotoSubStep('q2')
                              setNoteOpen(false)
                              setStep(3)
                            }}
                          >
                            Replace Q2
                          </button>
                        </div>
                        {reviewPlayingKey === key ? (
                          <AudioProgressBar progress={reviewProgress} />
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mw-actionsRow">
                <button
                  className="mw-button mw-buttonPrimary mw-buttonBig"
                  type="button"
                  onClick={() => {
                    stopFlipAudio()
                    setFlipIndex(0)
                    setStep(5)
                  }}
                >
                  Create my flipbook
                </button>
              </div>
              <div className="mw-mutedSmall">
                MVP flipbook uses next/prev (real page-turn animation can be added next).
              </div>
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="mw-gridOne">
            <div className="mw-card">
              <div className="mw-flipHeader">
                <div className="mw-mutedSmall">
                  Page {flipIndex + 1} of {pages.pageCount}
                </div>
                <div className="mw-inlineActions">
                  <button
                    className="mw-button mw-buttonSecondary mw-buttonSmall"
                    type="button"
                    onClick={() => setStep(4)}
                  >
                    Back to edit
                  </button>
                </div>
              </div>

              <div className="mw-flipBody">
                <div className="mw-flipMedia">
                  {flipIndex === 0 ? (
                    <div className="mw-coverBox">
                      <div className="mw-coverTitle">Memory Bin</div>
                      {introNote.trim() ? (
                        <div className="mw-heroSub mw-mt12">{introNote.trim()}</div>
                      ) : (
                        <div className="mw-heroSub mw-mt12">
                          Your cover narration{' '}
                          {introAudio ? 'is ready' : 'was skipped'}.
                        </div>
                      )}
                    </div>
                  ) : (
                    <img
                      src={photos[flipIndex - 1]?.previewUrl}
                      alt=""
                      className="mw-photoPreview"
                    />
                  )}
                </div>

                <div className="mw-flipControls">
                  {flipIndex === 0 && !introAudio ? (
                    <div className="mw-mutedSmall">No cover narration added.</div>
                  ) : (
                    <div className="mw-audioBlock">
                      <div className="mw-audioTop">
                        <button
                          className="mw-button mw-buttonPrimary"
                          type="button"
                          onClick={() => void toggleFlipPlay()}
                        >
                          {flipPlaying ? 'Pause audio' : 'Play audio'}
                        </button>
                        <div className="mw-mutedSmall">
                          {flipPlaying ? 'Playing...' : 'Ready'}
                        </div>
                      </div>
                      <AudioProgressBar progress={flipProgress} />
                    </div>
                  )}

                  <div className="mw-flipNav">
                    <button
                      className="mw-button mw-buttonSecondary"
                      type="button"
                      disabled={flipIndex === 0}
                      onClick={() => setFlipIndex((i) => Math.max(0, i - 1))}
                    >
                      Previous page
                    </button>
                    <button
                      className="mw-button mw-buttonSecondary"
                      type="button"
                      disabled={flipIndex >= pages.pageCount - 1}
                      onClick={() =>
                        setFlipIndex((i) => Math.min(pages.pageCount - 1, i + 1))
                      }
                    >
                      Next page
                    </button>
                  </div>

                  <div className="mw-mutedSmall mw-mt12">
                    Any page change stops audio immediately.
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

