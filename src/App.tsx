import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import CharacterSelect from "@/pages/CharacterSelect";
import Game from "@/pages/Game";
import Settings from "@/pages/Settings";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Boot />} />
        <Route path="/select" element={<CharacterSelect />} />
        <Route path="/game" element={<Game />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Router>
  );
}

function Boot() {
  const navigate = useNavigate();
  useEffect(() => {
    const last = localStorage.getItem('lastRoute') || '/';
    const connected = localStorage.getItem('apiConnected') === 'true';
    const configured = localStorage.getItem('apiConfigured') === 'true';
    if (connected || configured) {
      if (last && last !== '/') navigate(last);
      else navigate('/select');
    } else {
      navigate('/');
    }
  }, [navigate]);
  return <Settings />;
}
