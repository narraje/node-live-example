const captions = window.document.getElementById("captions");
const transcriptContent = window.document.getElementById("transcript-content");
const exportBtn = window.document.getElementById("export-btn");
const clearBtn = window.document.getElementById("clear-btn");
const transcriptContainer = window.document.getElementById("transcript-container");

// Array to store transcript history
let transcriptHistory = [];

// Function to clear the transcript
function clearTranscript() {
  transcriptHistory = [];
  transcriptContent.innerHTML = "";
}

async function getMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return new MediaRecorder(stream);
  } catch (error) {
    console.error("Error accessing microphone:", error);
    throw error;
  }
}

async function openMicrophone(microphone, socket) {
  return new Promise((resolve) => {
    microphone.onstart = () => {
      console.log("WebSocket connection opened");
      document.body.classList.add("recording");
      // Clear transcript history when starting a new recording
      clearTranscript();
      // Make sure the transcript container is visible
      transcriptContainer.style.display = "flex";
      resolve();
    };

    microphone.onstop = () => {
      console.log("WebSocket connection closed");
      document.body.classList.remove("recording");
      // Ensure container stays visible after recording stops
      transcriptContainer.style.display = "flex";
    };

    microphone.ondataavailable = (event) => {
      if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
        socket.send(event.data);
      }
    };

    microphone.start(1000);
  });
}

async function closeMicrophone(microphone) {
  microphone.stop();
}

// Function to download transcript as a text file
function downloadTranscript() {
  if (transcriptHistory.length === 0) {
    alert("No transcript available to export");
    return;
  }

  const text = transcriptHistory.join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `transcript-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
}

async function start(socket) {
  const listenButton = document.querySelector("#record");
  let microphone;

  console.log("client: waiting to open microphone");

  listenButton.addEventListener("click", async () => {
    if (!microphone) {
      try {
        microphone = await getMicrophone();
        await openMicrophone(microphone, socket);
      } catch (error) {
        console.error("Error opening microphone:", error);
      }
    } else {
      await closeMicrophone(microphone);
      microphone = undefined;
    }
  });

  // Add event listener for export button
  exportBtn.addEventListener("click", downloadTranscript);
  
  // Add event listener for clear button
  clearBtn.addEventListener("click", clearTranscript);
}

window.addEventListener("load", () => {
  const socket = new WebSocket("ws://localhost:3000");

  socket.addEventListener("open", async () => {
    console.log("WebSocket connection opened");
    await start(socket);
  });

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.channel?.alternatives?.[0]?.transcript !== "") {
      const transcript = data.channel.alternatives[0].transcript;
      
      // Update real-time captions
      captions.innerHTML = `<span>${transcript}</span>`;
      
      // Add to transcript history
      // Only add if it's a meaningful transcript (not empty after trimming)
      if (transcript.trim()) {
        // If this is the first transcript or the new transcript is longer than the previous one
        // or the new transcript is completely different from the last one, treat as new content
        const lastTranscript = transcriptHistory.length > 0 ? 
          transcriptHistory[transcriptHistory.length - 1] : "";
        
        const isLonger = transcript.length > lastTranscript.length;
        const isDifferent = !transcript.includes(lastTranscript) && !lastTranscript.includes(transcript);
        const isNewContent = transcriptHistory.length === 0 || isLonger || isDifferent;
        
        if (isNewContent) {
          // If the transcript is the continuation of the previous one, replace it
          if (transcriptHistory.length > 0 && transcript.startsWith(lastTranscript)) {
            transcriptHistory[transcriptHistory.length - 1] = transcript;
            
            if (transcriptContent.lastChild) {
              transcriptContent.lastChild.textContent = transcript;
            } else {
              const p = document.createElement("p");
              p.textContent = transcript;
              transcriptContent.appendChild(p);
            }
          } else {
            // Add as completely new content
            transcriptHistory.push(transcript);
            
            const p = document.createElement("p");
            p.textContent = transcript;
            transcriptContent.appendChild(p);
          }
        } else {
          // Update the existing content
          if (transcriptContent.lastChild) {
            transcriptContent.lastChild.textContent = transcript;
          } else {
            const p = document.createElement("p");
            p.textContent = transcript;
            transcriptContent.appendChild(p);
          }
          
          // Update the transcript history
          transcriptHistory[transcriptHistory.length - 1] = transcript;
        }
        
        // Ensure we always scroll to the bottom of the transcript
        setTimeout(() => {
          transcriptContent.scrollTop = transcriptContent.scrollHeight;
        }, 10);
        
        // Debug logging to help diagnose transcript issues
        console.log("Transcript collection status:", {
          transcriptLength: transcript.length,
          historyCount: transcriptHistory.length,
          lastLength: lastTranscript.length,
          isNewContent,
          isLonger,
          isDifferent
        });
      }
    }
  });

  socket.addEventListener("close", () => {
    console.log("WebSocket connection closed");
  });
});
