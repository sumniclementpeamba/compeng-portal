// frontend/src/hooks/useFaceApi.js
import * as faceapi from '@vladmandic/face-api';
import { useEffect, useRef, useState } from 'react';

const MODEL_URL = '/models'; // Path to your models in the public folder

export function useFaceApi() {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('Loading face detection models...');
  const detectionIntervalRef = useRef(null);

  useEffect(() => {
    const loadModels = async () => {
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        setIsModelLoaded(true);
        setStatus('Models loaded. Ready to scan.');
      } catch (err) {
        console.error('Error loading face-api models:', err);
        setError('Could not load face detection models. Please refresh.');
      }
    };
    loadModels();
    // Cleanup interval on unmount
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, []);

  /**
   * Starts a detection loop on a given video element.
   * @param {HTMLVideoElement} videoEl - The video element to scan.
   * @param {function} onFaceStable - Callback triggered when a face is stable.
   */
  const startDetection = (videoEl, onFaceStable) => {
    if (!isModelLoaded || !videoEl) return;
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);

    setStatus('Scanning for your face...');
    let stableStartTime = 0;
    const STABILITY_TIME_MS = 1500;

    detectionIntervalRef.current = setInterval(async () => {
      if (!videoEl || videoEl.paused || videoEl.ended) return;

      const detections = await faceapi
        .detectAllFaces(videoEl, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      if (detections.length === 0) {
        setStatus('Position your face in the frame');
        stableStartTime = 0;
        return;
      }

      if (detections.length > 1) {
        setStatus('Only one person in view');
        stableStartTime = 0;
        return;
      }

      const detection = detections[0];
      const box = detection.detection.box;
      const videoWidth = videoEl.videoWidth;
      const videoHeight = videoEl.videoHeight;

      // Basic check for face size and position
      const faceSize = Math.min(box.width, box.height);
      const faceRatio = faceSize / Math.min(videoWidth, videoHeight);
      const faceCenterX = box.x + box.width / 2;
      const faceCenterY = box.y + box.height / 2;
      const videoCenterX = videoWidth / 2;
      const videoCenterY = videoHeight / 2;
      const centerOffset = Math.hypot(
        faceCenterX - videoCenterX,
        faceCenterY - videoCenterY
      );
      const normalizedOffset = centerOffset / (videoWidth / 2);

      if (faceRatio < 0.15) {
        setStatus('Move closer to the camera');
        stableStartTime = 0;
      } else if (normalizedOffset > 0.5) {
        setStatus('Centre your face');
        stableStartTime = 0;
      } else {
        if (stableStartTime === 0) {
          stableStartTime = Date.now();
          setStatus('Hold still...');
        } else if (Date.now() - stableStartTime > STABILITY_TIME_MS) {
          setStatus('Face captured successfully');
          clearInterval(detectionIntervalRef.current);
          detectionIntervalRef.current = null;
          onFaceStable(videoEl); // Trigger the capture
        }
      }
    }, 100); // Scan roughly every 100ms
  };

  const stopDetection = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    setStatus(isModelLoaded ? 'Models loaded. Ready to scan.' : 'Loading...');
  };

  return { isModelLoaded, error, status, startDetection, stopDetection };
}