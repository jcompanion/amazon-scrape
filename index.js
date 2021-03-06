require("dotenv").config()
const send_email = process.env.GMAIL_EMAIL
const email_pass = process.env.GMAIL_PASSWORD

const nightmare = require("nightmare")({
  waitTimeout: 60000 // in ms
})
const express = require("express")
const bodyParser = require("body-parser")
const exphbs = require("express-handlebars")
const nodemailer = require("nodemailer")
const path = require("path")
const cron = require("node-cron")
const { doesNotMatch } = require("assert")
let now = new Date()

const port = 3001

const app = express()

//View engine HBS setup
app.engine(
  "hbs",
  exphbs({
    extname: "hbs",
    defaultLayout: "index",
    layoutsDir: __dirname + "/views/layouts",
    partialsDir: __dirname + "/views/partials"
  })
)
app.set("view engine", "hbs")

//Static Folder
app.use("/public", express.static(path.join(__dirname, "public")))

//BodyParser Middleware
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))
// parse application/json
app.use(bodyParser.json())

//Route for initial form data
app.get("/", function (req, res) {
  res.render("main")
})

app.get("/404", function (req, res) {
  res.render("404")
})

//Gather form data and send it through email using nodemailer
app.post("/send", (req, res) => {
  let fName = req.body.f_name
  let lName = req.body.l_name
  let url = req.body.url
  let price = req.body.price
  let email = req.body.email

  let output = `
  <p>You have successfully started tracking the product!</p>
  <h3>Details</h3>
  <ul>
  <li>First Name: ${fName}</li>
  <li>Last Name: ${lName}</li>
  <li>Email: ${email}</li>
  <li>Price Alert: ${price}</li>
  <li>Amazon Product: ${url}</li>
  </ul>
  <p>We will email you once the price drops!</p>
  `

  console.log(`Url provided: ${url}, Price alert: ${price}, Email: ${email}`)

  getProduct(url, price, res)

  checkPrice(url, price, email)

  main(email, output).catch(console.error)
  console.log("Sending Initial email with customer information")
})

//Send email with price information
async function main(u, o) {
  now = new Date()
  // create reusable transporter object using the default SMTP transport
  let transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
      user: send_email, // Email account sending from
      pass: email_pass // Email account password
    }
  })

  // send mail with defined transport object
  let info = await transporter.sendMail({
    from: send_email, // sender address
    to: u, // list of receivers
    subject: `New alert!`, // Subject line
    html: o // html body
  })

  console.log("Message sent: %s", info.messageId)
  // Message sent

  console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info))
  // Preview URL
}

async function getProduct(url, price, res, email) {
  try {
    const productInfo = await nightmare.goto(url).evaluate(() => {
      return [document.getElementById("landingImage").src, document.getElementById("priceblock_ourprice").innerText, document.getElementById("productTitle").innerText]
    })

    checkPrice(url, price, email)
    console.log(productInfo)
    res.render("sent", { url: url, enteredp: price, pimage: productInfo[0], cprice: productInfo[1], title: productInfo[2] })
  } catch (error) {
    throw error
  }
}

//Check Price Function using nightmare
async function checkPrice(url, price, email) {
  console.log("CheckPrice Function: " + url)
  let lowPrice = Number(price)
  let customerEmail = email
  let priceString = await new nightmare.goto(url)
    .wait("#priceblock_ourprice")
    .evaluate(() => document.getElementById("priceblock_ourprice").innerText)
    .then(console.log)
    .catch(error => {
      console.error("Search failed: ", error)
    })
    .end()

  let priceNumber = parseFloat(priceString.replace("$", ""))

  if (priceNumber <= lowPrice) {
    console.log(`It is cheap, buy now! Price: $${priceNumber}`)
    let message = `
        <h1>Congrats!</h1>
        <p>Looks like there was a drop in price! The product is available for: $${priceNumber}</p>
        <h2>Buy now</h2>
        <p>${url}</p>
        `

    main(customerEmail, message)
    console.log(`${now.toUTCString()}: Price drop message sending to: ${customerEmail}...`)
  } else {
    console.log("It is still too expensive")
    cron.schedule("* */10 * * *", () => {
      now = new Date()
      console.log(`${now.toUTCString()}: Cron Job Starting Price scan...`)
      console.log(`Stored Product Info: Amazon URL: ${url}, Price: ${price}, Customer Email: ${email}`)
      checkPrice(url, price, email)
    })
  }
}

//Start server
app.listen(port, () => console.log(`Server Started Port: ${port}...`))
