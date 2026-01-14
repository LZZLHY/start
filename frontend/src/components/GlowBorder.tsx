import { useEffect, useRef, useState } from 'react'
import { useAppearanceStore } from '../stores/appearance'

type Props = {
  isActive: boolean
  width: number
  height: number
  radius: number
}

/**
 * 流光边框组件 - 流星拖尾效果沿边框匀速移动
 * 使用 SVG stroke-dashoffset 实现真正的匀速动画
 */
export function GlowBorder({ isActive, width, height, radius }: Props) {
  const pathRef = useRef<SVGRectElement>(null)
  const [pathLength, setPathLength] = useState(0)
  const [dashOffset, setDashOffset] = useState(0)
  const animationRef = useRef<number>(0)
  const accent = useAppearanceStore((s) => s.accent)

  // 获取路径长度
  useEffect(() => {
    if (pathRef.current) {
      setPathLength(pathRef.current.getTotalLength())
    }
  }, [width, height, radius])

  // 动画循环 - 匀速移动
  useEffect(() => {
    if (!isActive || pathLength === 0) {
      cancelAnimationFrame(animationRef.current)
      return
    }

    let offset = dashOffset
    const speed = pathLength / 240 // 240帧转一圈，约4秒

    const animate = () => {
      offset = (offset + speed) % pathLength
      setDashOffset(offset)
      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animationRef.current)
    }
  }, [isActive, pathLength])

  if (width === 0 || height === 0) return null

  // 流星长度（周长的 30%）
  const meteorLength = pathLength * 0.3
  // 边框宽度
  const strokeWidth = 1

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      style={{
        opacity: isActive ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    >
      <defs>
        {/* 流星渐变 - 头亮尾暗 */}
        <linearGradient id="meteor-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={accent} stopOpacity="0" />
          <stop offset="50%" stopColor={accent} stopOpacity="0.3" />
          <stop offset="80%" stopColor={accent} stopOpacity="0.7" />
          <stop offset="100%" stopColor={accent} stopOpacity="1" />
        </linearGradient>
        
        {/* 发光滤镜 */}
        <filter id="glow-filter" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 外发光层 */}
      <rect
        x={strokeWidth / 2}
        y={strokeWidth / 2}
        width={width - strokeWidth}
        height={height - strokeWidth}
        rx={radius}
        ry={radius}
        stroke={accent}
        strokeWidth={strokeWidth * 4}
        strokeLinecap="round"
        fill="none"
        opacity={0.3}
        filter="url(#glow-filter)"
        style={{
          strokeDasharray: `${meteorLength * 0.5} ${pathLength - meteorLength * 0.5}`,
          strokeDashoffset: -dashOffset,
        }}
      />

      {/* 主流星边框 */}
      <rect
        ref={pathRef}
        x={strokeWidth / 2}
        y={strokeWidth / 2}
        width={width - strokeWidth}
        height={height - strokeWidth}
        rx={radius}
        ry={radius}
        stroke="url(#meteor-grad)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
        style={{
          strokeDasharray: `${meteorLength} ${pathLength - meteorLength}`,
          strokeDashoffset: -dashOffset,
        }}
      />
    </svg>
  )
}
