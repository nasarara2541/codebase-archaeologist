import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  return (
    <>
      <div className="app min-h-screen text-blue-200 flex items-center flex-col p-20">
        <div className="mb-10 grid grid-cols-4 grid-rows-2 w-1/2 mx-auto">
          <img
            className="col-span-2 row-span-3"
            src={viteLogo}
            alt="Vite Logo"
            width="300"
          />

          <img
            className="col-span-2 row-span-3 animate-spin m-auto"
            style={{ animationDuration: "30s" }}
            src={reactLogo}
            alt="React Logo"
            width="300"
          />
        </div>
        <h1 className='text-2xl lg:text-5xl mb-10 text-right text-blue'>
          Welcome to Your New Vite + React App
          <span className="block text-lg text-blue-400">on DigitalOcean</span>
        </h1>
        <div className="grid grid-cols-2 grid-rows-2 gap-4">

          <a href="https://www.digitalocean.com/docs/app-platform"
            className='py-3 px-6 bg-purple-400 hover:bg-purple-300
              text-purple-800 hover:text-purple-900 block rounded
              text-center shadow flex items-center justify-center
              leading-snug text-xs transition ease-in duration-150'>
            DigitalOcean Docs
          </a>

          <a href="https://cloud.digitalocean.com/apps"
            className='py-3 px-6 bg-purple-400 hover:bg-purple-300
              text-purple-800 hover:text-purple-900 block rounded
              text-center shadow flex items-center justify-center
              leading-snug text-xs transition ease-in duration-150'>
            DigitalOcean Dashboard
          </a>
        </div>
      </div>
    </>
  )
}

export default App
