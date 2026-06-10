import { useEffect, useRef } from 'react'

import Aurora from './components/Aurora/Aurora'

const assets = {
  logo: '/home-assets/logo.png',
  button: '/home-assets/button.png',
  signature: '/home-assets/signature.png',
  shiqi: '/home-assets/shiqi.png',
  work: '/home-assets/work.png',
  starLarge: '/home-assets/star-small.png',
  starSmall: '/home-assets/star-large.png',
}

const FOREGROUND_MOTION = {
  damping: 0.04,
  shiqi: { x: 4, y: 3 },
  work: { x: 4, y: 3 },
  starLarge: { x: 10, y: 8 },
  starSmall: { x: 10, y: 8 },
  signature: { x: 32, y: 20, damping: 0.07 },
} as const

function App() {
  const shiqiRef = useRef<HTMLImageElement | null>(null)
  const workRef = useRef<HTMLImageElement | null>(null)
  const signatureRef = useRef<HTMLImageElement | null>(null)
  const starLargeRef = useRef<HTMLImageElement | null>(null)
  const starSmallRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    let frame = 0
    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0
    let signatureCurrentX = 0
    let signatureCurrentY = 0

    const applyTransforms = (x: number, y: number, signatureX: number, signatureY: number) => {
      if (shiqiRef.current) {
        shiqiRef.current.style.transform = `translateX(-50%) translate3d(${x * FOREGROUND_MOTION.shiqi.x}px, ${y * FOREGROUND_MOTION.shiqi.y}px, 0)`
      }

      if (workRef.current) {
        workRef.current.style.transform = `translate3d(${x * FOREGROUND_MOTION.work.x}px, ${y * FOREGROUND_MOTION.work.y}px, 0)`
      }

      if (starLargeRef.current) {
        starLargeRef.current.style.transform = `translate3d(${x * FOREGROUND_MOTION.starLarge.x}px, ${y * FOREGROUND_MOTION.starLarge.y}px, 0)`
      }

      if (starSmallRef.current) {
        starSmallRef.current.style.transform = `translate3d(${x * FOREGROUND_MOTION.starSmall.x}px, ${y * FOREGROUND_MOTION.starSmall.y}px, 0)`
      }

      if (signatureRef.current) {
        signatureRef.current.style.transform = `translate3d(${signatureX * FOREGROUND_MOTION.signature.x}px, ${signatureY * FOREGROUND_MOTION.signature.y}px, 0)`
      }
    }

    const animate = () => {
      currentX += (targetX - currentX) * FOREGROUND_MOTION.damping
      currentY += (targetY - currentY) * FOREGROUND_MOTION.damping
      signatureCurrentX += (targetX - signatureCurrentX) * FOREGROUND_MOTION.signature.damping
      signatureCurrentY += (targetY - signatureCurrentY) * FOREGROUND_MOTION.signature.damping

      applyTransforms(currentX, currentY, signatureCurrentX, signatureCurrentY)
      frame = requestAnimationFrame(animate)
    }

    const handlePointerMove = (event: PointerEvent) => {
      targetX = (event.clientX / window.innerWidth - 0.5) * 2
      targetY = (event.clientY / window.innerHeight - 0.5) * 2
    }

    const handlePointerLeave = () => {
      targetX = 0
      targetY = 0
    }

    applyTransforms(0, 0, 0, 0)
    frame = requestAnimationFrame(animate)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerleave', handlePointerLeave)

    return () => {
      if (frame) {
        cancelAnimationFrame(frame)
      }

      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [])

  return (
    <main className="relative h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black">
        <div
          className="absolute inset-x-0 bottom-[calc(-18vh+20px)] h-[82vh] w-full"
          style={{ transform: 'scale(-1.3, -1)' }}
        >
          <Aurora
            colorStops={['#381000', '#DF7300', '#FF4800']}
            amplitude={1.5}
            blend={0.72}
            speed={0.792}
          />
        </div>
        <div className="film-noise absolute inset-0" />
        <div className="absolute inset-0 bg-black/14" />
      </div>

      <section className="relative z-10 flex h-full items-center justify-center px-4 sm:px-6">
        <div className="relative w-full max-w-[1440px]">
          <div className="relative mx-auto aspect-[1440/900] w-full">
            <img
              src={assets.logo}
              alt=""
              className="absolute left-[1.22%] top-[1.37%] w-[17.2%] max-w-[248px] select-none"
              draggable="false"
            />

            <img
              ref={starLargeRef}
              src={assets.starLarge}
              alt=""
              className="absolute left-[65.35%] top-[22.44%] w-[6.94%] max-w-[100px] select-none will-change-transform"
              draggable="false"
            />

            <img
              ref={starSmallRef}
              src={assets.starSmall}
              alt=""
              className="absolute left-[71.25%] top-[28.21%] w-[2.92%] max-w-[42px] select-none will-change-transform"
              draggable="false"
            />

            <img
              ref={shiqiRef}
              src={assets.shiqi}
              alt=""
              className="absolute left-1/2 top-[27.7%] w-[34.4%] max-w-[490px] select-none will-change-transform"
              draggable="false"
              style={{ transform: 'translateX(-50%) translate3d(0, 0, 0)' }}
            />

            <img
              ref={workRef}
              src={assets.work}
              alt=""
              className="absolute left-[6.25%] top-[40.22%] w-[85.55%] max-w-[1232px] select-none will-change-transform"
              draggable="false"
            />

            <img
              ref={signatureRef}
              src={assets.signature}
              alt=""
              className="absolute left-[71.39%] top-[55.55%] w-[18.9%] max-w-[272px] select-none will-change-transform"
              draggable="false"
            />

            <button
              type="button"
              className="absolute left-1/2 top-[70.67%] z-20 w-[14.31%] min-w-[132px] max-w-[206px] -translate-x-1/2 transition-transform duration-200 hover:scale-[1.02] focus:outline-none"
            >
              <img
                src={assets.button}
                alt="开始使用"
                className="block w-full select-none"
                draggable="false"
              />
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
