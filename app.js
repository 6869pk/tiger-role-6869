// --- Supabase Config[cite: 6] ---
const SUPABASE_URL = "https://bkgyqjpbiwqzpywrzbbf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrZ3lxanBiaXdxenB5d3J6YmJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MzcxOTUsImV4cCI6MjEwNTMxMzE5NX0.P3iZtEYI1YJ2zKHGk-NvBEq5qHt2JPuzFgo-jlUXKo8";

// สร้าง Supabase Client จัดการเรื่อง Session Token ให้อัตโนมัติ ไม่หลุด Unauthorized
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let state = {
  user: null,
  profile: null,
  sessionToken: null
};

let historyAllData = [];
let currentHistoryPage = 1;
const itemsPerPage = 20;

function formatCodeInGroups(code) {
  if (!code) return "";
  const cleaned = String(code).replace(/\s+/g, '');
  return cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
}

// ยิงเข้า Edge Function โดยส่ง User Token จริง เพื่อให้ผ่านเงื่อนไข Backend[cite: 6]
async function callBackend(action, payload = {}) {
  const token = state.sessionToken;
  if (!token) throw new Error("ไม่พบ Token ยืนยันตัวตน กรุณาเข้าสู่ระบบใหม่");

  const res = await fetch(`${SUPABASE_URL}/functions/v1/tiger-api`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${token}`, // ส่ง User Token จริงตามที่ Backend บังคับตรวจ[cite: 6]
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action, payload })
  });
  
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || json.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ Tiger API");
  return json;
}

// ================= AUTHENTICATION FLOW (ใช้ Supabase Client เสถียร 100%) =================
const formLogin = document.getElementById("form-login");
const authAlert = document.getElementById("auth-alert");

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  authAlert.classList.add("hidden");
  const btn = document.getElementById("btn-login");
  btn.textContent = "กำลังตรวจสอบ...";
  btn.disabled = true;

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    // 1. เข้าสู่ระบบผ่าน Supabase Client
    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (authError || !authData.session) {
      throw new Error(authError?.message || "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }

    state.sessionToken = authData.session.access_token;
    state.user = authData.user;

    // 2. ดึงสิทธิ์ผู้ใช้งานจาก profiles[cite: 6]
    const { data: profiles, error: profError } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", state.user.id);

    if (profError || !profiles || profiles.length === 0) {
      // Fallback ให้ถ้าไม่มีแถวใน profiles จะอิงตาม Email ก่อน[cite: 6]
      state.profile = {
        id: state.user.id,
        email: state.user.email,
        display_name: state.user.email.includes("tar@") ? "คุณต้าร์ (Owner)" : "พนักงานจุดบริการ",
        role: state.user.email.includes("tar@") ? "owner" : "staff",
        pin_code: "1234"
      };
    } else {
      state.profile = profiles[0];
    }

    initDashboard();

  } catch (err) {
    authAlert.textContent = err.message;
    authAlert.classList.remove("hidden");
  } finally {
    btn.textContent = "เข้าสู่ระบบ";
    btn.disabled = false;
  }
});

document.getElementById("btn-logout").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  state = { user: null, profile: null, sessionToken: null };
  document.getElementById("view-dashboard").classList.add("hidden");
  document.getElementById("view-auth").classList.remove("hidden");
  document.getElementById("login-password").value = "";
});

function initDashboard() {
  document.getElementById("view-auth").classList.add("hidden");
  document.getElementById("view-dashboard").classList.remove("hidden");
  document.getElementById("user-display").textContent = `${state.profile.display_name} (${state.profile.email})`;

  const badge = document.getElementById("badge-role");
  const ownerPanel = document.getElementById("panel-owner");

  if (state.profile.role === "owner") {
    badge.textContent = "OWNER PORTAL";
    badge.className = "text-xs px-2.5 py-0.5 rounded-full font-bold bg-purple-100 text-purple-800";
    ownerPanel.classList.remove("hidden");
  } else {
    badge.textContent = "STAFF PORTAL";
    badge.className = "text-xs px-2.5 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-800";
    ownerPanel.classList.add("hidden");
  }

  loadStaffHistory();
}

// ปุ่มเพิ่มช่องกรอกคูปองเดิม
document.getElementById("btn-add-voucher-input").addEventListener("click", () => {
  const container = document.getElementById("voucher-inputs-container");
  const count = container.querySelectorAll(".staff-v-input").length + 1;
  const div = document.createElement("div");
  div.className = "flex gap-2 items-center";
  div.innerHTML = `
    <input type="text" placeholder="ยิงหรือพิมพ์เลขคูปองใบที่ ${count}" class="staff-v-input flex-1 px-3 py-2 border rounded-lg uppercase tracking-wider text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none">
    <button type="button" onclick="this.parentElement.remove()" class="text-red-500 hover:text-red-700 px-2 py-1 font-bold text-xs bg-red-50 rounded">ลบ</button>
  `;
  container.appendChild(div);
  div.querySelector("input").focus();
});

// ================= ฟังก์ชันพิเศษ 1: สร้าง Voucher จ่ายเอง (ลับ **1) =================
document.getElementById("btn-owner-direct").addEventListener("click", async () => {
  const staff = state.profile.display_name;
  const rawAmount = document.getElementById('owner_direct_amount').value.trim();
  const ref = document.getElementById('owner_direct_ref').value.trim() || 'OWNER-DIRECT';

  // ตรวจสอบเงื่อนไขลับ **1
  if (!rawAmount.endsWith("**1")) {
    return alert("ข้อมูลไม่ถูกต้อง ไม่สามารถดำเนินการได้");
  }

  const cleanAmountStr = rawAmount.replace("**1", "").trim();
  const amount = parseFloat(cleanAmountStr);
  if (isNaN(amount) || amount <= 0) {
    return alert("กรุณาระบุยอดเงินที่ถูกต้อง");
  }

  const btn = document.getElementById('btn-owner-direct');
  btn.disabled = true;
  btn.innerText = "กำลังสร้าง Voucher...";

  try {
    const txId = `TX-OWN-${Date.now()}`;
    const createRes = await callBackend("create", {
      amount: amount.toFixed(2),
      ref_num: `${ref}**1`,
      note: `Owner Direct: ${amount.toFixed(2)}`
    });

    const newCode = Array.isArray(createRes?.result) ? createRes.result[0] : (createRes?.result || createRes?.[0]);
    if (!newCode) throw new Error("Tiger สร้างยอดเงินสำเร็จแต่ไม่ได้ส่งรหัสคูปองกลับมา");[cite: 5]

    await callBackend("db_insert", {
      transaction_id: txId,
      action_type: 'OWNER_DIRECT',
      staff_name: staff,
      total_amount: amount,
      new_voucher_code: String(newCode),
      old_vouchers: [{ code: 'DIRECT', amount: amount }],
      ref_num: ref,
      error_message: 'ออกคูปองพิเศษ'
    });

    renderAndPrintCombineSlip({
      txId,
      dateStr: new Date().toLocaleString('th-TH'),
      staff: staff,
      ref: ref,
      oldVouchers: [{ desc: "ออกคูปองพิเศษ", amount: amount }],
      totalAmount: amount.toFixed(2),
      newCode: String(newCode),
      isReprint: false
    });

    document.getElementById('owner_direct_amount').value = '';
    document.getElementById('owner_direct_ref').value = '';
    loadStaffHistory();
  } catch (err) {
    alert("เกิดข้อผิดพลาด: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "อนุมัติสร้าง Voucher ทันที";
  }
});

// ================= ฟังก์ชันพิเศษ 2: ยกเลิกและออกคูปองใหม่ทดแทน (ลับ **1) =================
document.getElementById("btn-owner-reissue").addEventListener("click", async () => {
  const staff = state.profile.display_name;
  const oldCode = document.getElementById('owner_reissue_old_code').value.trim().replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  const rawAmount = document.getElementById('owner_reissue_amount').value.trim();

  if (!oldCode || oldCode.length < 5) return alert("กรุณาระบุรหัสคูปองเดิมให้ถูกต้อง");

  // ตรวจสอบเงื่อนไขลับ **1
  if (!rawAmount.endsWith("**1")) {
    return alert("ข้อมูลไม่ถูกต้อง ไม่สามารถดำเนินการได้");
  }

  const cleanAmountStr = rawAmount.replace("**1", "").trim();
  const amount = parseFloat(cleanAmountStr);
  if (isNaN(amount) || amount <= 0) {
    return alert("กรุณาระบุยอดเงินที่ถูกต้อง");
  }

  if (!confirm(`ยืนยันยกเลิกคูปอง [${oldCode}] และสร้าง Voucher ใหม่ยอด ${amount.toFixed(2)} บาท?`)) return;

  const btn = document.getElementById('btn-owner-reissue');
  btn.disabled = true;
  btn.innerText = "กำลังดำเนินการ...";

  try {
    await callBackend("cancel", { voucher_num: oldCode });[cite: 5]

    const txId = `TX-REISSUE-${Date.now()}`;
    const createRes = await callBackend("create", {
      amount: amount.toFixed(2),
      ref_num: `REISSUE-${oldCode}`,
      note: `Owner Reissued from ${oldCode}`
    });

    const newCode = Array.isArray(createRes?.result) ? createRes.result[0] : (createRes?.result || createRes?.[0]);
    if (!newCode) throw new Error("Tiger สร้างยอดใหม่สำเร็จแต่ไม่ได้ส่งรหัสคูปองกลับมา");[cite: 5]

    await callBackend("db_insert", {
      transaction_id: txId,
      action_type: 'OWNER_REISSUE',
      staff_name: staff,
      total_amount: amount,
      new_voucher_code: String(newCode),
      old_vouchers: [{ code: oldCode, amount: amount }],
      ref_num: `REISSUE-${oldCode}`,
      error_message: `ยกเลิก ${oldCode} -> ออกใหม่`
    });

    renderAndPrintCombineSlip({
      txId,
      dateStr: new Date().toLocaleString('th-TH'),
      staff: staff,
      ref: `REISSUE-${oldCode}`,
      oldVouchers: [{ desc: `ยกเลิกเดิม: ${oldCode}`, amount: amount }],
      totalAmount: amount.toFixed(2),
      newCode: String(newCode),
      isReprint: false
    });

    document.getElementById('owner_reissue_old_code').value = '';
    document.getElementById('owner_reissue_amount').value = '';
    loadStaffHistory();
  } catch (err) {
    alert("เกิดข้อผิดพลาด: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "ยกเลิกใบเดิม & สร้าง Voucher ใหม่";
  }
});

// ================= ฟังก์ชันรวมยอดคูปองสำหรับพนักงาน (จากไฟล์ตัวเดิม)[cite: 5] =================
async function processStaffCombine() {
  const staff = state.profile.display_name;
  const ref = document.getElementById('staff_combine_ref').value.trim();
  const inputs = Array.from(document.querySelectorAll('.staff-v-input'))
                      .map(i => i.value.trim().replace(/[^0-9a-zA-Z]/g, ''))
                      .filter(v => v.length > 0);[cite: 5]

  if (!staff) return alert("กรุณาระบุชื่อพนักงาน");[cite: 5]
  if (!ref) return alert("กรุณาระบุเลขที่บิล / เอกสารอ้างอิง");[cite: 5]
  if (inputs.length < 2) return alert("ต้องระบุรหัสคูปองเดิมตั้งแต่ 2 ใบขึ้นไป");[cite: 5]

  const btn = document.getElementById('btn-combine');
  btn.disabled = true;
  btn.innerText = "กำลังตรวจสอบยอดจากตู้ Tiger...";[cite: 5]

  try {
    let totalAmount = 0;
    let oldVoucherDetails = [];

    for (const code of inputs) {
      const showRes = await callBackend("show", { voucher_num: code });[cite: 5]
      const voucherObj = showRes?.voucher || showRes?.result || showRes?.data || (Array.isArray(showRes) ? showRes[0] : showRes);[cite: 5]

      const rawAmt = voucherObj?.amount ?? voucherObj?.balance;[cite: 5]
      const amt = parseFloat(String(rawAmt || '').replace(/,/g, ''));[cite: 5]
      const isUsed = String(voucherObj?.used) === "1" || voucherObj?.used === 1 || voucherObj?.used === true;[cite: 5]

      if (isNaN(amt) || amt <= 0) {
        throw new Error(`คูปอง ${code} ไม่พบยอดเงิน หรือตรวจสอบไม่ได้`);[cite: 5]
      }

      if (isUsed) {
        throw new Error(`คูปอง ${code} ถูกใช้งานหรือยกเลิกไปแล้ว (used = 1)`);[cite: 5]
      }

      await callBackend("cancel", { voucher_num: code });[cite: 5]
      totalAmount += amt;[cite: 5]
      oldVoucherDetails.push({ code: code, amount: amt });[cite: 5]
    }

    btn.innerText = "กำลังสร้างคูปองใหม่...";[cite: 5]

    const txId = `TX-${Date.now()}`;[cite: 5]
    const createRes = await callBackend("create", {
      amount: totalAmount.toFixed(2),
      ref_num: ref,
      note: `Staff Combined: ${inputs.join(",")}`
    });[cite: 5]

    const newCode = Array.isArray(createRes?.result) ? createRes.result[0] : (createRes?.result || createRes?.[0]);[cite: 5]
    if (!newCode) throw new Error("Tiger สร้างยอดรวมสำเร็จแต่ไม่ได้ส่งรหัสคูปองใหม่กลับมา");[cite: 5]

    await callBackend("db_insert", {
      transaction_id: txId,
      action_type: 'COMBINE',
      staff_name: staff,
      total_amount: totalAmount,
      new_voucher_code: String(newCode),
      old_vouchers: oldVoucherDetails,
      ref_num: ref,
      error_message: 'รวมยอดสำเร็จ'
    });[cite: 5]

    renderAndPrintCombineSlip({
      txId,
      dateStr: new Date().toLocaleString('th-TH'),
      staff: staff,
      ref: ref,
      oldVouchers: oldVoucherDetails,
      totalAmount: totalAmount.toFixed(2),
      newCode: String(newCode),
      isReprint: false
    });[cite: 5]

    document.getElementById('staff_combine_ref').value = '';[cite: 5]
    const container = document.getElementById("voucher-inputs-container");
    container.innerHTML = `
      <input type="text" placeholder="ยิงหรือพิมพ์เลขคูปองใบที่ 1" class="staff-v-input w-full px-3 py-2 border rounded-lg uppercase tracking-wider text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none">
      <input type="text" placeholder="ยิงหรือพิมพ์เลขคูปองใบที่ 2" class="staff-v-input w-full px-3 py-2 border rounded-lg uppercase tracking-wider text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none">
    `;

    loadStaffHistory();
  } catch (err) {
    alert("เกิดข้อผิดพลาด: " + err.message);[cite: 5]
  } finally {
    btn.disabled = false;
    btn.innerText = "ตรวจสอบยอดและดำเนินการรวมคูปอง";[cite: 5]
  }
}

document.getElementById('btn-combine').addEventListener('click', processStaffCombine);

// ================= ฟังก์ชันยกเลิกเดี่ยว (จากไฟล์ตัวเดิม)[cite: 5] =================
async function processStaffCancel() {
  const staff = state.profile.display_name;
  const code = document.getElementById('staff_cancel_code').value.trim().replace(/[^0-9a-zA-Z]/g, '').toUpperCase();[cite: 5]
  const reason = document.getElementById('staff_cancel_reason').value.trim() || 'Staff VOID';[cite: 5]

  if (!staff) return alert("กรุณาระบุชื่อพนักงาน");[cite: 5]
  if (!code || code.length < 5) return alert("กรุณาระบุรหัสคูปอง 12 หลัก");[cite: 5]
  if (!confirm(`ยืนยันการยกเลิกคูปอง ${code} หรือไม่?`)) return;[cite: 5]

  const btn = document.getElementById('btn-cancel');
  btn.disabled = true;
  btn.innerText = "กำลังยกเลิก...";[cite: 5]

  try {
    await callBackend("cancel", { voucher_num: code });[cite: 5]
    const txId = `VOID-${Date.now()}`;[cite: 5]

    await callBackend("db_insert", {
      transaction_id: txId,
      action_type: 'CANCEL_SINGLE',
      staff_name: staff,
      total_amount: 0.00,
      old_vouchers: [{ code, amount: 0 }],
      ref_num: '-',
      error_message: reason
    });[cite: 5]

    renderAndPrintVoidSlip({
      txId,
      dateStr: new Date().toLocaleString('th-TH'),
      staff: staff,
      voucherNum: code,
      reason: reason
    });[cite: 5]

    document.getElementById('staff_cancel_code').value = '';[cite: 5]
    document.getElementById('staff_cancel_reason').value = '';[cite: 5]
    loadStaffHistory();
  } catch (err) {
    alert("เกิดข้อผิดพลาด: " + err.message);[cite: 5]
  } finally {
    btn.disabled = false;
    btn.innerText = "ยืนยันการยกเลิกคูปอง";[cite: 5]
  }
}

document.getElementById('btn-cancel').addEventListener('click', processStaffCancel);

// ================= โหลดประวัติและระบบแบ่งหน้า 20 รายการ[cite: 5] =================
async function loadStaffHistory() {
  const tbody = document.getElementById('staff-history-rows');[cite: 5]
  const pag = document.getElementById('history-pagination');[cite: 5]
  pag.classList.add('hidden');[cite: 5]
  tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400 font-bold">กำลังโหลดประวัติ...</td></tr>`;[cite: 5]

  try {
    const data = await callBackend("db_select");[cite: 5]
    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400 font-bold">ยังไม่มีประวัติการทำรายการ</td></tr>`;[cite: 5]
      return;
    }

    historyAllData = data;[cite: 5]
    currentHistoryPage = 1;[cite: 5]
    renderHistoryPage();[cite: 5]
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-rose-500 font-bold">โหลดข้อมูลล้มเหลว: ${err.message}</td></tr>`;[cite: 5]
  }
}

document.getElementById("btn-refresh-history").addEventListener("click", loadStaffHistory);

function renderHistoryPage() {
  const tbody = document.getElementById('staff-history-rows');[cite: 5]
  const pag = document.getElementById('history-pagination');[cite: 5]
  const totalItems = historyAllData.length;[cite: 5]
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;[cite: 5]

  if (currentHistoryPage < 1) currentHistoryPage = 1;[cite: 5]
  if (currentHistoryPage > totalPages) currentHistoryPage = totalPages;[cite: 5]

  const startIndex = (currentHistoryPage - 1) * itemsPerPage;[cite: 5]
  const pageData = historyAllData.slice(startIndex, startIndex + itemsPerPage);[cite: 5]

  tbody.innerHTML = pageData.map(item => `
    <tr class="hover:bg-slate-50 border-b border-slate-200 text-xs">
      <td class="p-3.5 font-mono">${new Date(item.created_at).toLocaleString('th-TH')}</td>
      <td class="p-3.5 font-mono font-bold text-slate-900">${item.transaction_id}<br><span class="text-slate-400 text-[11px] font-normal">${item.ref_num || '-'}</span></td>
      <td class="p-3.5">
        <span class="px-2.5 py-1 rounded text-xs font-black ${
          item.action_type === 'COMBINE' ? 'bg-amber-100 text-amber-800' :
          (item.action_type === 'OWNER_DIRECT' ? 'bg-amber-500 text-white' :
          (item.action_type === 'OWNER_REISSUE' ? 'bg-purple-100 text-purple-800' : 'bg-rose-100 text-rose-800'))
        }">
          ${item.action_type}
        </span>
      </td>
      <td class="p-3.5 font-medium">${item.staff_name}</td>
      <td class="p-3.5 font-black text-emerald-600 text-sm">${parseFloat(item.total_amount).toFixed(2)}</td>
      <td class="p-3.5 font-mono text-slate-500">${item.new_voucher_code ? formatCodeInGroups(item.new_voucher_code) : '-'}</td>
      <td class="p-3.5 text-center font-bold">${item.reprint_count || 0}</td>
      <td class="p-3.5 text-right">
        <button type="button" onclick='reprintStaffRecord(${JSON.stringify(item)})' class="bg-slate-800 hover:bg-black text-white px-3.5 py-1.5 rounded-lg text-xs font-bold transition">Reprint</button>
      </td>
    </tr>
  `).join('');[cite: 5]

  pag.classList.remove('hidden');[cite: 5]
  document.getElementById('history-page-info').innerText = `แสดงรายการ ${startIndex + 1} - ${Math.min(startIndex + itemsPerPage, totalItems)} จากทั้งหมด ${totalItems} รายการ`;[cite: 5]
  document.getElementById('history-page-num').innerText = `${currentHistoryPage} / ${totalPages}`;[cite: 5]
  document.getElementById('btn-prev-page').disabled = currentHistoryPage === 1;[cite: 5]
  document.getElementById('btn-next-page').disabled = currentHistoryPage === totalPages;[cite: 5]
}

document.getElementById('btn-prev-page').addEventListener('click', () => { currentHistoryPage--; renderHistoryPage(); });[cite: 5]
document.getElementById('btn-next-page').addEventListener('click', () => { currentHistoryPage++; renderHistoryPage(); });[cite: 5]

async function reprintStaffRecord(item) {
  const repStaff = prompt("ระบุชื่อพนักงานผู้พิมพ์ซ้ำ:", state.profile.display_name);[cite: 5]
  if (!repStaff) return;[cite: 5]

  try {
    await callBackend("db_update", {
      id: item.id,
      updateData: {
        reprint_count: (item.reprint_count || 0) + 1,
        last_reprint_at: new Date().toISOString(),
        reprinted_by: repStaff
      }
    });[cite: 5]
  } catch (e) {
    console.warn("Update reprint count failed:", e);
  }

  if (item.action_type === 'COMBINE' || item.action_type === 'OWNER_DIRECT' || item.action_type === 'OWNER_REISSUE') {
    renderAndPrintCombineSlip({
      txId: item.transaction_id,
      dateStr: new Date(item.created_at).toLocaleString('th-TH'),
      staff: item.staff_name,
      ref: item.ref_num,
      oldVouchers: item.old_vouchers,
      totalAmount: parseFloat(item.total_amount).toFixed(2),
      newCode: item.new_voucher_code,
      isReprint: true,
      reprintBy: repStaff
    });[cite: 5]
  } else if (item.action_type === 'CANCEL_SINGLE') {
    renderAndPrintVoidSlip({
      txId: item.transaction_id,
      dateStr: new Date(item.created_at).toLocaleString('th-TH'),
      staff: item.staff_name,
      voucherNum: item.old_vouchers?.[0]?.code || '-',
      reason: item.error_message,
      isReprint: true,
      reprintBy: repStaff
    });[cite: 5]
  }
}

// ================= ฟังก์ชันพิมพ์สลิปตามของเดิม[cite: 5] =================
function renderAndPrintCombineSlip({ txId, dateStr, staff, ref, oldVouchers = [], totalAmount, newCode, isReprint = false, reprintBy }) {
  const slip = document.getElementById("thermal-slip");[cite: 5]
  const headerBadge = isReprint ? `*** REPRINT SLIP (${reprintBy || staff}) ***` : `*** ใบรับเงินรวมคูปอง ***`;[cite: 5]
  const headerBadge2 = isReprint ? `*** REPRINT SLIP (${reprintBy || staff}) ***` : `*** หลักฐานการรวมคูปอง ***`;[cite: 5]

  const oldListHtml1 = oldVouchers.map((v, i) => `
    <div class="flex justify-between">
      <span>บิลที่ ${i + 1}: ${v.code || v.desc || ''}</span>
      <span>${parseFloat(v.amount).toFixed(2)} บาท</span>
    </div>
  `).join('');[cite: 5]

  const oldListHtml2 = oldVouchers.map((v, i) => `
    <div class="flex justify-between">
      <span>${v.code || v.desc || `บิลที่ ${i + 1}`}</span>
      <span>${parseFloat(v.amount).toFixed(2)} ฿</span>
    </div>
  `).join('');[cite: 5]

  slip.innerHTML = `
    <!-- ท่อนที่ 1 (ลูกค้า) -->
    <div class="slip-segment text-left">
      <div class="border border-black py-1 text-center font-bold text-[13px] tracking-wide mb-1">
        ${headerBadge}
      </div>
      <div class="text-center font-bold text-[13px] mb-2">
        ใบรับเงินรวมคูปอง<br>
        <span class="text-[11px] font-normal">(เอกสารสำหรับลูกค้า)</span>
      </div>

      <div class="text-[12px] font-bold space-y-0.5 mb-2">
        <div>วันที่-เวลา: ${dateStr}</div>
        <div>พนักงาน: ${staff} | บิล: ${ref || '-'}</div>
        <div>TX ID: ${txId}</div>
      </div>

      <div class="border-t border-dotted border-black pt-1.5 pb-1 space-y-1 text-[12px]">
        ${oldListHtml1}
      </div>

      <div class="border-t border-black pt-1.5 flex justify-between items-baseline text-base font-black mt-1">
        <span>ยอดรวมสุทธิ:</span>
        <span class="text-lg">${parseFloat(totalAmount).toFixed(2)} บาท</span>
      </div>
    </div>

    <div class="page-break"></div>

    <!-- ท่อนที่ 2 (ร้านค้าเก็บ/สแกนตู้) -->
    <div class="slip-segment text-center pt-1">
      <div class="border border-black py-1 text-center font-bold text-[13px] tracking-wide mb-1">
        ${headerBadge2}
      </div>
      <div class="text-center font-bold text-[13px] mb-2">
        หลักฐานการรวมคูปอง<br>
        <span class="text-[11px] font-normal">(ร้านเก็บไว้ / สแกนที่ตู้จ่ายเงิน)</span>
      </div>

      <div class="text-left text-[12px] font-bold space-y-0.5 mb-2">
        <div>วันที่-เวลา: ${dateStr} | TX: ${txId}</div>
        <div>พนักงาน: ${staff} | บิล: ${ref || '-'}</div>
      </div>

      <div class="border-t border-dotted border-black pt-1.5 pb-1 space-y-1 text-[12px] text-left">
        ${oldListHtml2}
      </div>

      <div class="border-t border-black pt-1.5 text-left font-black text-[13px] mb-2">
        ยอดเงินสร้างใหม่: ${parseFloat(totalAmount).toFixed(2)} บาท
      </div>

      <div class="text-xl font-black font-mono tracking-widest my-2">${formatCodeInGroups(newCode)}</div>

      <div class="flex justify-center my-3">
        <div id="print-qr-code" class="p-2 bg-white inline-block"></div>
      </div>

      <div class="text-[10.5px] font-bold text-center mt-1">
        *** นำ QR Code ด้านบนไปสแกนที่ตู้จ่ายเงิน ***
      </div>
    </div>
  `;[cite: 5]

  new QRCode(document.getElementById("print-qr-code"), {
    text: String(newCode).trim(),
    width: 175,
    height: 175,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });

  slip.classList.remove("hidden");[cite: 5]
  setTimeout(() => {
    window.print();
    slip.classList.add("hidden");[cite: 5]
  }, 200);
}

function renderAndPrintVoidSlip({ txId, dateStr, staff, voucherNum, reason, isReprint = false, reprintBy }) {
  const slip = document.getElementById("thermal-slip");[cite: 5]
  const header = isReprint ? `*** REPRINT VOID SLIP (${reprintBy || staff}) ***` : `*** ใบยกเลิกคูปอง (VOID SLIP) ***`;[cite: 5]

  slip.innerHTML = `
    <div class="slip-segment text-left font-mono">
      <div class="border-2 border-black py-1.5 text-center font-black text-sm tracking-wide mb-3">
        ${header}
      </div>
      <div class="text-xs space-y-1.5 mb-3">
        <div>รหัสธุรกรรม: <strong>${txId}</strong></div>
        <div>วันที่-เวลา: ${dateStr}</div>
        <div>พนักงาน: <strong>${staff}</strong></div>
        <div class="border-t border-b border-black py-2 my-2 text-sm">
          <div>รหัสคูปองที่ยกเลิก:</div>
          <div class="text-lg font-black tracking-widest mt-1">${formatCodeInGroups(voucherNum)}</div>
        </div>
        <div>เหตุผล: <span class="font-bold">${reason || '-'}</span></div>
      </div>
      <div class="mt-8 pt-3 border-t border-dashed border-black flex justify-between text-[11px]">
        <div>( ลงชื่อผู้ยกเลิก )</div>
        <div>( ผู้จัดการ/พยาน )</div>
      </div>
    </div>
  `;[cite: 5]

  slip.classList.remove("hidden");[cite: 5]
  setTimeout(() => {
    window.print();
    slip.classList.add("hidden");[cite: 5]
  }, 150);
}

// ตรวจสอบสถานะล็อกอินเดิมค้างไว้
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    state.sessionToken = session.access_token;
    state.user = session.user;
    const { data: profiles } = await supabaseClient.from("profiles").select("*").eq("id", state.user.id);
    if (profiles && profiles.length > 0) {
      state.profile = profiles[0];
    } else {
      state.profile = {
        id: state.user.id,
        email: state.user.email,
        display_name: state.user.email.includes("tar@") ? "คุณต้าร์ (Owner)" : "พนักงานจุดบริการ",
        role: state.user.email.includes("tar@") ? "owner" : "staff",
        pin_code: "1234"
      };
    }
    initDashboard();
  }
});
