import './Login.css'
import React, { use, useState } from 'react'
import { useNavigate } from 'react-router-dom'
function Login() {
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  
  const navigate = useNavigate()

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)

    try{
      const response = await fetch("http://localhost:8000/login",{
        method: 'POST',
        credentials: 'include',
        headers : {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password }),
    });

    setLoading(false)

    if (response.ok){
      navigate('/admin')
    }
    }
    catch (error){
      setLoading(false)
      console.log('An error occured')
    }
  }

  return (
    <div className="page">
      <div className="login-card">
        <h1 className="title">
          Login
          <span className="title-underline" />
        </h1>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <span className="input-icon">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M17 8V7a5 5 0 0 0-10 0v1c-1.1 0-2 .9-2 2v9c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-9c0-1.1-.9-2-2-2zM9 7a3 3 0 0 1 6 0v1H9V7z" />
              </svg>
            </span>
            <input
              type="text"
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              />
          </div>

          <button type="submit" className="login-button">
            Login
          </button>
        </form>

        <p className="signup-hint">Don't have an account? Sign Up</p>
      </div>
    </div>
  )
}

export default Login
