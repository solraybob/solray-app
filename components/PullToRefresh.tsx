'use client';

import { useEffect, useState, useRef } from 'react';

/**
 * PullToRefresh — Standard iOS/Android pull-to-refresh gesture.
 * 
 * Drag down from the top of the screen to refresh the page.
 * Shows a spinner while dragging, auto-refreshes when you pull far enough.
 */

export default function PullToRefresh() {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startYRef = useRef(0);
  const maxPullRef = useRef(120);

  useEffect(() => {
    let isScrolledDown = false;

    const handleTouchStart = (e: TouchEvent) => {
      // Only start pull-to-refresh if user is at the very top of the page
      isScrolledDown = window.scrollY > 10;
      if (!isScrolledDown) {
        startYRef.current = e.touches[0].clientY;
        setPulling(true);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!pulling || isScrolledDown) return;

      const currentY = e.touches[0].clientY;
      const distance = Math.max(0, currentY - startYRef.current);

      // Clamp distance to max
      const clamped = Math.min(distance, maxPullRef.current);
      setPullDistance(clamped);
    };

    const handleTouchEnd = () => {
      if (!pulling) return;

      setPulling(false);

      // If pulled far enough (>100px), refresh
      if (pullDistance > 100) {
        console.log('[PullToRefresh] Triggered refresh');
        window.location.reload();
      }

      setPullDistance(0);
    };

    document.addEventListener('touchstart', handleTouchStart, false);
    document.addEventListener('touchmove', handleTouchMove, false);
    document.addEventListener('touchend', handleTouchEnd, false);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pulling, pullDistance]);

  // Only show indicator if actively pulling
  if (!pulling || pullDistance === 0) return null;

  const percentage = (pullDistance / maxPullRef.current) * 100;
  const rotation = (percentage / 100) * 360;

  return (
    <div
      style={{
        position: 'fixed',
        top: pullDistance - 40,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      {/* Spinner */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '3px solid #e8821a',
          borderTopColor: 'transparent',
          transform: `rotate(${rotation}deg)`,
          opacity: Math.min(1, percentage / 100),
        }}
      />

      {/* Release text */}
      {percentage > 80 && (
        <div
          style={{
            marginTop: 8,
            fontSize: '12px',
            color: '#e8821a',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            opacity: (percentage - 80) / 20,
          }}
        >
          Release to refresh
        </div>
      )}
    </div>
  );
}
