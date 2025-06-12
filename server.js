const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const PDFDocument = require("pdfkit");

const app = express();

// Allow all origins during development, later restrict it to specific domains
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000", // Dynamically pick frontend URL
  methods: ["GET", "POST"],
};

app.use(cors(corsOptions));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

mongoose.connect("mongodb+srv://kajal9306174:Kajal%408010@cluster0.jfuiuyx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log("MongoDB Atlas connected"))
  .catch((err) => console.log("MongoDB Connection Error:", err));

const stockSchema = new mongoose.Schema({
  stockType: String,
  material: String,
  articleName: String,
  color: String,
  size: String,
  gender: String,
  cartons: Number,
  quantityPerCarton: Number,
  price: Number,
  sku: String,
  totalQuantity: Number,
});

const Stock = mongoose.model("Stock", stockSchema);

// 🆕 Add or update stock based on stockType
app.post("/add-stock", async (req, res) => {
  try {
    const { stockType, material, articleName, color, size, gender, cartons, quantityPerCarton, price, sku } = req.body;
    const deltaQty = cartons * quantityPerCarton;

    const existing = await Stock.findOne({ articleName, color, size });

    if (existing) {
      if (stockType === "in") {
        existing.totalQuantity += deltaQty;
      } else if (stockType === "out") {
        existing.totalQuantity -= deltaQty;
        if (existing.totalQuantity < 0) existing.totalQuantity = 0;
      }
      await existing.save();
      res.send("Stock updated successfully!");
    } else {
      const newStock = new Stock({
        stockType, material, articleName, color, size, gender,
        cartons, quantityPerCarton, price, sku,
        totalQuantity: stockType === "in" ? deltaQty : 0
      });
      await newStock.save();
      res.send("Stock added successfully!");
    }
  } catch (error) {
    console.log("Error adding/updating stock:", error);
    res.status(500).send("Error processing stock");
  }
});

// 📦 Grouped stock list
app.get("/stock-list", async (req, res) => {
  try {
    const stocks = await Stock.find();
    let groupedStocks = {};

    stocks.forEach(stock => {
      if (!groupedStocks[stock.articleName]) {
        groupedStocks[stock.articleName] = {};
      }
      if (!groupedStocks[stock.articleName][stock.color]) {
        groupedStocks[stock.articleName][stock.color] = {
          material: stock.material,
          gender: stock.gender,
          sizes: {}
        };
      }
      groupedStocks[stock.articleName][stock.color].sizes[stock.size] =
        (groupedStocks[stock.articleName][stock.color].sizes[stock.size] || 0) + stock.totalQuantity;
    });

    res.json(groupedStocks);
  } catch (err) {
    res.status(500).send("Error fetching stock list");
  }
});

// 🧾 PDF generator
app.get("/generate-pdf/:category", async (req, res) => {
  const category = req.params.category;
  let filter = {};

  if (category === "all") filter = {};
  else if (["male", "female", "kids"].includes(category)) filter = { gender: category };
  else if (["PU", "EVA"].includes(category)) filter = { material: category };

  try {
    const stocks = await Stock.find(filter);

    const doc = new PDFDocument({ margin: 30 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=${category}_Stock_Report.pdf`);
    doc.pipe(res);

    doc.fontSize(18).font("Helvetica-Bold").text("GP FAX STOCK AVAILABILITY REPORT", { align: "center" });
    doc.moveDown().fontSize(12).text(`Category: ${category.toUpperCase()}`, { align: "center" });
    doc.text(`Generated on: ${new Date().toLocaleString()}`, { align: "center" });
    doc.moveDown(2);

    const headers = ["Article", "Color", "Size", "Gender", "Quantity"];
    const columnWidths = [100, 100, 60, 80, 80];
    let y = doc.y;

    headers.forEach((h, i) => {
      doc.rect(30 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0), y, columnWidths[i], 20).fillAndStroke("#cce5ff", "#000");
      doc.fillColor("#000").text(h, 35 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 5);
    });

    y += 20;

    stocks.forEach(stock => {
      const row = [stock.articleName, stock.color, stock.size, stock.gender, stock.totalQuantity.toString()];
      row.forEach((text, i) => {
        doc.rect(30 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0), y, columnWidths[i], 20).stroke();
        doc.fillColor("#000").text(text, 35 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0), y + 5);
      });
      y += 20;

      if (y > 750) {
        doc.addPage();
        y = 30;
      }
    });

    doc.end();
  } catch (error) {
    console.error("PDF Generation Error:", error);
    res.status(500).send("Failed to generate PDF.");
  }
});

app.post("/delete-stock", async (req, res) => {
  const { articleName, color, size } = req.body;
  try {
    await Stock.deleteMany({ articleName, color, size });
    res.send("Stock entry deleted successfully!");
  } catch (err) {
    console.log("Delete error:", err);
    res.status(500).send("Error deleting stock");
  }
});

// Server listening on dynamic port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Server running on ${process.env.BASE_URL || `http://localhost:${port}`}`);
});
