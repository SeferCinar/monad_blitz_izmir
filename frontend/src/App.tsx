import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import QuizLobbyPage from './pages/QuizLobbyPage'
import VoteLobbyPage from './pages/VoteLobbyPage'
import CreateQuiz from './pages/CreateQuiz'
import CreateVote from './pages/CreateVote'
import MyLobbies from './pages/MyLobbies'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/my" element={<MyLobbies />} />
        <Route path="/quiz/:address" element={<QuizLobbyPage />} />
        <Route path="/vote/:address" element={<VoteLobbyPage />} />
        <Route path="/create/quiz" element={<CreateQuiz />} />
        <Route path="/create/vote" element={<CreateVote />} />
      </Route>
    </Routes>
  )
}
