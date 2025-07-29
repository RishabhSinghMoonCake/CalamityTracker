import autocannon from 'autocannon'
const url = 'http://localhost:8000/api/get-calamities-db'
const duration = 30


const res = autocannon({
  url,
  duration,

}, (err,result)=>{
  if(err)
  {
    console.error(err)
  }
  else
  {
    console.log("Result: " , result)
  }
})

autocannon.track(res)