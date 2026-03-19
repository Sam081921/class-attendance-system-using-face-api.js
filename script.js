const video = document.getElementById('video')
const statusEl = document.getElementById('status')
let cameraStream = null
let canvas = null
let isProcessing = false
let labeledFaceDescriptors = []
let faceMatcher = null

// Load models
async function loadModels() {
  statusEl.textContent = 'Loading models...'
  
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
    faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
    faceapi.nets.faceRecognitionNet.loadFromUri('/models')
  ])
  
  statusEl.textContent = 'Models loaded. Loading labeled faces...'
  
  await loadLabeledImages()
  
  if (labeledFaceDescriptors.length > 0) {
    faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.5)
    statusEl.textContent = `Ready! Recognizing: ${labeledFaceDescriptors.map(l => l.label).join(', ')}`
  } else {
    statusEl.textContent = 'No labeled faces loaded. Add images to /labeled_images/'
  }
  
  startVideo()
}

async function loadLabeledImages() {
  try {
    // Try to get faces from server first
    let faces = [];
    try {
      const response = await fetch('http://localhost:3000/faces-list');
      faces = await response.json();
      console.log('✅ Loaded faces from server:', faces);
    } catch (err) {
      console.log('Server not running, using default labels');
    }
    
    // If server has faces, use those labels
    let labels = [];
    if (faces.length > 0) {
      labels = faces.map(f => f.name);
    } else {
      // Fallback to default labels
      labels = ['person1', 'person2', 'john', 'jane', 'you'];
    }
    
    labeledFaceDescriptors = []
    
    for (const label of labels) {
      statusEl.textContent = `Loading ${label}...`
      
      // Try to get images from server first
      let imgUrls = [];
      const faceFromServer = faces.find(f => f.name === label);
      
      if (faceFromServer && faceFromServer.images) {
        imgUrls = faceFromServer.images;
      } else {
        // Fallback to default pattern
        imgUrls = [
          `/labeled_images/${label}/1.jpg`,
          `/labeled_images/${label}/2.jpg`
        ];
      }
      
      const faceDescriptors = []
      
      for (const url of imgUrls) {
        try {
          const img = await faceapi.fetchImage(url)
          const detections = await faceapi
            .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptor()
          
          if (detections) {
            faceDescriptors.push(detections.descriptor)
            console.log(`✅ Loaded ${label} from ${url}`)
          }
        } catch (err) {
          console.log(`Could not load ${url}`);
        }
      }
      
      if (faceDescriptors.length > 0) {
        labeledFaceDescriptors.push(
          new faceapi.LabeledFaceDescriptors(label, faceDescriptors)
        )
        console.log(`📁 Added ${label} with ${faceDescriptors.length} face(s)`)
      }
    }
    
  } catch (err) {
    console.error('Error loading labeled images:', err)
  }
}

async function startVideo() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ 
      video: {
        width: 640,
        height: 480,
        frameRate: { ideal: 10 }
      } 
    })
    video.srcObject = cameraStream
  } catch (err) {
    console.error('Camera error:', err)
    statusEl.textContent = 'Camera error!'
  }
}

video.addEventListener('playing', () => {
  if (canvas) return

  canvas = faceapi.createCanvasFromMedia(video)
  document.body.append(canvas)

  const displaySize = { 
    width: video.videoWidth, 
    height: video.videoHeight 
  }
  faceapi.matchDimensions(canvas, displaySize)

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 224,
    scoreThreshold: 0.5
  })

  setInterval(async () => {
    if (video.paused || video.ended || isProcessing) return
    
    isProcessing = true
    
    try {
      const detections = await faceapi
        .detectAllFaces(video, options)
        .withFaceLandmarks()
        .withFaceDescriptors()
      
      const validDetections = detections.filter(d => 
        d.detection.box.width > 70 && d.detection.box.height > 70
      )

      const resizedDetections = faceapi.resizeResults(validDetections, displaySize)
      
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      if (validDetections.length > 0) {
        // Draw face boxes
        faceapi.draw.drawDetections(canvas, resizedDetections)
        
        // Draw face landmarks on EVERY face
        faceapi.draw.drawFaceLandmarks(canvas, resizedDetections)
        
        // Draw names on top of landmarks
        if (faceMatcher) {
          validDetections.forEach((detection, i) => {
            const resizedDetection = resizedDetections[i]
            const { box } = resizedDetection.detection
            const descriptor = detection.descriptor
            
            const match = faceMatcher.findBestMatch(descriptor)
            
            // Draw name background
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
            ctx.fillRect(box.x, box.y - 35, box.width, 35)
            
            if (match.label !== 'unknown') {
              // KNOWN FACE - draw name in GREEN
              ctx.fillStyle = '#00ff00'
              ctx.font = 'bold 18px Arial'
              ctx.fillText(match.label, box.x + 10, box.y - 12)
              
              // Draw confidence
              ctx.fillStyle = '#ffffff'
              ctx.font = '12px Arial'
              ctx.fillText(`${Math.round((1 - match.distance) * 100)}%`, 
                box.x + box.width - 50, box.y - 12)
            } else {
              // UNKNOWN FACE - draw "Unknown" in YELLOW
              ctx.fillStyle = '#ffaa00'
              ctx.font = 'bold 16px Arial'
              ctx.fillText('Unknown', box.x + 10, box.y - 12)
            }
          })
        }
      }

    } catch (error) {
      console.error('Detection error:', error)
    } finally {
      isProcessing = false
    }
  }, 400)
})

// Cleanup
window.addEventListener('beforeunload', () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop())
  }
})

// Start everything
loadModels()