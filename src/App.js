import logo from './logo.svg';
import './App.css';
import React, { useState, useRef } from 'react';

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, addDoc, setDoc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';

function App() {
  
  const firebaseConfig = {
      apiKey: "AIzaSyAtgoeugUvh6E4e5bOF7vNTXy4QCHKB0as",
      authDomain: "server-61cc8.firebaseapp.com",
      projectId: "server-61cc8",
      storageBucket: "server-61cc8.appspot.com",
      messagingSenderId: "714072976475",
      appId: "1:714072976475:web:746b81d42249ca114fa37e",
      measurementId: "G-93B7FHEXWM"
  };

  const firebaseApp = initializeApp(firebaseConfig);
  const firestore = getFirestore(firebaseApp);

  const servers = {
    iceServers: [
      {
        urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
      },
    ],
    iceCandidatePoolSize: 10,
  };

  const [callInput, setCallInput] = useState("");
  const [mediaState, setMediaState] = useState("getUserMedia");
  const [avState, setAvState] = useState({ 
    video: true, 
    audio: true 
  });
  const [disableState, setDisableState] = useState({
    startMedia: false,
    call: true,
    idInput: true,
    answer: true,
    hangup: true
  });
  
  const handleInputChange = (event) => {
    // set callInput state to incoming input value
    setCallInput(event.target.value);
    // toggle button states
    setDisableState((prevState) => {
      return {...prevState,
        answer: false,
      }
    });
  };

  const pc = useRef();
  const localStream = useRef();
  const remoteStream = useRef();
  
  // 1. Get User Media Stream, and Instantiate/Configure RTC PeerConnection
  const startCam = async () => {

    pc.current = new RTCPeerConnection(servers);

    console.log("Starting Web Cam...");

    // add toggle options for DisplayMedia vs userMedia aswell ad Audio/Video Options *************************************************************************************************************************************************************************
    // localStream.current.srcObject = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    localStream.current.srcObject = await navigator.mediaDevices[mediaState](avState);
    remoteStream.current.srcObject = new MediaStream();

    // toggle button states
    setDisableState((prevState) => {
      return {...prevState,
        startMedia: true,
        call: false,
        idInput: false
      }
    });

    // Push tracks from local stream to peer connection
    localStream.current.srcObject.getTracks().forEach((track) => {
      pc.current.addTrack(track, localStream.current.srcObject);
    });

    // Pull tracks from remote stream, add to video stream
    pc.current.ontrack = (event) => {
      console.log("onTrack Fired!");
      console.log(event.streams[0].getTracks());
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.current.srcObject.addTrack(track);
      });
    };

    console.log("New Local Peer Connection Object:")
    console.log(pc.current)
  };

  // 2. Create an offer
  const newCall = async () => {

    // toggle button states
    setDisableState((prevState) => {
      return {...prevState,
        call: true,
        idInput: true,
        answer: true,
        hangup: false
      }
    });

    // Reference Firestore collections for signaling
    const callDoc = doc(collection(firestore, "calls"));
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    // setstate "CallInput" to pass callDoc ID to UI input el.
    setCallInput(callDoc.id);

    // Get candidates for caller, save to db
    pc.current.onicecandidate = (event) => {
      event.candidate && addDoc(offerCandidates, event.candidate.toJSON());
    };

    // Create offer
    const offerDescription = await pc.current.createOffer();
    await pc.current.setLocalDescription(offerDescription);

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
    };

    // set offer document in callDoc
    await setDoc(callDoc, { offer });

    // Listen for remote answer in callDoc and 
    onSnapshot(callDoc, (snapshot) => {
      const data = snapshot.data();
      if (!pc.current.currentRemoteDescription && data?.answer) {
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.current.setRemoteDescription(answerDescription);
      }
    });

    // When answered, add candidate to peer connection
    onSnapshot(answerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.current.addIceCandidate(candidate);
        }
      });
    });

    console.log(pc.current)
    console.log(pc.current.ontrack)
  };

  // 3. Answer the call with the unique ID
  const answerCall = async () => {

    // toggle button states
    setDisableState((prevState) => {
      return {...prevState,
        call: true,
        idInput: true,
        answer: true,
        hangup: false
      }
    });

    const callId = callInput;
    const callDoc = doc(firestore, "calls", callId);
    const answerCandidates = collection(callDoc, 'answerCandidates');
    const offerCandidates = collection(callDoc, 'offerCandidates');

    pc.current.onicecandidate = (event) => {
      event.candidate && addDoc(answerCandidates, event.candidate.toJSON());
    };

    const callData = await getDoc(callDoc);

    const offerDescription = callData.data().offer;
    await pc.current.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await updateDoc(callDoc, { answer });

    // When answered, add candidate to peer connection
    onSnapshot(offerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.current.addIceCandidate(candidate);
        }
      });
    });

    console.log(pc.current)
    console.log(pc.current.ontrack)
  };

  const hangupCall = async () => {
    console.log("Hangingup Call...")
    pc.current.close();
    pc.current.onicecandidate = null;
    pc.current.ontrack = null;

    localStream.current.srcObject = null;
    remoteStream.current.srcObject = null;

    setCallInput("");

    // toggle button states
    setDisableState((prevState) => {
      return {...prevState,
        startMedia: false,
        hangup: true
      }
    });
  };

  const handleRadio = (event) => {
    const value = event.target.value
    setMediaState( value === "camera" ? "getUserMedia" : "getDisplayMedia");
    setAvState(value === "screen" && avState.video === false
        ?
      (prevState) => {
        return {...prevState, 
          video: true,
        }
      }
        :
      (prevState) => {
        return {...prevState}
      }
    );
  };

  const handleCheck = (event) => {
    const checked = event.target.checked;
    const name = event.target.name;

    if( !checked && (avState.audio || avState.video) && !(avState.audio && avState.video) ) {
      setAvState((prevState) => {
        return {...prevState, 
          video: !avState.video,
          audio: !avState.audio
        }
      });
    }else{
      setAvState((prevState) => {
        return {...prevState, 
          [name]: checked
        }
      });
    }
  };

  return (
    <div className="App">
      <a
        className="App-link"
        href="https://reactjs.org"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img src={logo} className="App-logo" alt="logo" />
      </a>
      
      <div className="videos">
        <span>
          <h3>Local</h3>
          <video ref={localStream} id="webcamVideo" autoPlay playsInline></video>
        </span>
        <span>
          <h3>Remote</h3>
          <video ref={remoteStream} id="remoteVideo" autoPlay playsInline></video>
        </span>
      </div>

      <div className='streamOptions'>
        <div>
          <input 
            type="radio" 
            id="camera" 
            name="drone" 
            value="camera" 
            onChange={handleRadio} 
            checked={mediaState==="getUserMedia"} 
            disabled={disableState.startMedia}
          />
          <label htmlFor="camera">Camera</label>
        </div>

        <div>
          <input 
            type="radio"
            id="screen" 
            name="drone" 
            value="screen" 
            onChange={handleRadio} 
            checked={mediaState==="getDisplayMedia"} 
            disabled={disableState.startMedia}
          />
          <label htmlFor="screen">Screen</label>
        </div>

        <div>
          <input 
            type="checkbox"
            id="video"
            name="video"
            onChange={handleCheck}
            checked={avState.video}
            disabled={disableState.startMedia || mediaState==="getDisplayMedia"}
          />
          <label htmlFor="video">video</label>
        </div>

        <div>
          <input 
            type="checkbox"
            id="audio"
            name="audio"
            onChange={handleCheck} 
            checked={avState.audio}
            disabled={disableState.startMedia || mediaState==="getDisplayMedia"}
          />
          <label htmlFor="horns">audio</label>
        </div>

        <button
          className="btn btn-info btn-block"
          type="button"
          id="webcamButton"
          onClick={startCam}
          disabled={disableState.startMedia}
        >
          Start {mediaState==="getUserMedia"? "Webcam" : "Capture"}
        </button>
      </div>

      <h5>Create a new Call</h5>
      <button
        className="btn btn-info btn-block"
        type="button"
        id="callButton"
        onClick={newCall}
        disabled={disableState.call}
      >
        Call
      </button>
      
      <h5>Join a Call</h5>
      
      <input 
        id="callInput" 
        type="text"
        placeholder='Call ID'
        autoComplete="off"
        value={callInput} 
        onChange={handleInputChange}
        disabled={disableState.idInput}
      />

      <button
        className="btn btn-info btn-block"
        type="button"
        id="answerButton"
        onClick={answerCall}
        disabled={disableState.answer}
      >
        Answer
      </button>

      <button
        className="btn btn-info btn-block"
        type="button"
        id="hangupButton"
        onClick={hangupCall}
        disabled={disableState.hangup}
      >
        Hangup
      </button>

    </div>
  );
}

export default App;