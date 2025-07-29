import Map from "./pages/Map.jsx";
import { ToastContainer } from "react-toastify";

function App() {
  return (
    <div className="App">
      <Map />
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick={false}
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
        />
    </div>
  );
}

export default App;