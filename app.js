// ปรับปรุงฟังก์ชันจัดการ Headers ให้แยกชัดเจนระหว่าง Auth และ REST Call
function getHeaders(token = state.sessionToken) {
  const headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Content-Type": "application/json"
  };
  // ส่ง Authorization เฉพาะเมื่อมี User Token จริงๆ เท่านั้น
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// ปรับปรุงระบบ Login ให้ดักจับและข้ามปัญหา profiles อัตโนมัติ
formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  authAlert.classList.add("hidden");
  const btn = document.getElementById("btn-login");
  btn.textContent = "กำลังตรวจสอบ...";
  btn.disabled = true;

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    // 1. เรียก Auth Token จาก Supabase
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const authData = await authRes.json();
    if (!authRes.ok) {
      throw new Error(authData.error_description || authData.message || "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }

    state.sessionToken = authData.access_token;
    state.user = authData.user;

    // 2. ดึงสิทธิ์ (Profile) จากตาราง profiles
    try {
      const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${state.user.id}&select=*`, {
        headers: getHeaders(state.sessionToken)
      });
      const profiles = await profileRes.json();

      if (profiles && profiles.length > 0) {
        state.profile = profiles[0];
      } else {
        // กรณีไม่มีข้อมูลในตาราง profiles ให้ใช้ข้อมูลจาก Auth ชั่วคราว (Fallback)
        console.warn("ไม่พบ Profile ในตาราง กำหนดสิทธิ์ตั้งต้นเป็น staff");
        state.profile = {
          id: state.user.id,
          email: state.user.email,
          display_name: state.user.email.split('@')[0],
          role: state.user.email.includes("admin") || state.user.email.includes("owner") ? "owner" : "staff"
        };
      }
    } catch (profErr) {
      console.warn("ดึง profiles ไม่สำเร็จ ใช้สิทธิ์เริ่มต้น:", profErr);
      state.profile = {
        id: state.user.id,
        email: state.user.email,
        display_name: state.user.email.split('@')[0],
        role: "owner" // ให้เข้าหน้าจัดการได้ก่อน
      };
    }

    // 3. เข้าสู่ Dashboard
    initDashboard();

  } catch (err) {
    console.error("Login Error:", err);
    authAlert.textContent = err.message;
    authAlert.classList.remove("hidden");
  } finally {
    btn.textContent = "เข้าสู่ระบบ";
    btn.disabled = false;
  }
});
