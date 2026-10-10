// Test script for Node backend
const payload = {
  questions: [
    {
      id: "q1",
      text: "- How do you like your computer?\n- It's great, but I [ ... ] a few weeks to buy it. Prices are lower now.",
      options: ["may wait", "may have waited", "should wait", "should've waited"],
      target_type: "dropdown"
    }
  ]
};

async function testBackend() {
  console.log("Đang gửi yêu cầu giải bài tập tới http://localhost:5000/api/solve...");
  const resp = await fetch("http://localhost:5000/api/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await resp.json();
  console.log("Kết quả từ Backend:", JSON.stringify(data, null, 2));
}

testBackend();
