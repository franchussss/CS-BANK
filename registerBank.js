const axios = require("axios");

const TOKEN = "59wWNmrhz0pEs8gKln4SLvudTMoALbDcBDmmdm7R2rw";

async function registrarBanco() {
  try {
    const response = await axios.post(
      "https://centralbank.brocoly.cc/api/banks",
      {
        name: "CSBANK"
      },
      {
        headers: {
          "Authorization": `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
          "x-environment": "test"
        }
      }
    );

    console.log("Banco registrado:");
    console.log(response.data);

  } catch (error) {
    console.error(
      error.response?.data || error.message
    );
  }
}

registrarBanco();