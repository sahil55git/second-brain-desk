import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // A couple of example rows matching the artifact's own demo data
  // (see claude/dashboard-app-plan.md).

  await prisma.jobWorkIntake.createMany({
    data: [
      {
        customer: "Example — Ramesh Patil",
        vehicleNo: "KA-38-A-1234",
        seedKg: 80,
        cakeOwnership: "SHOP",
        advanceCustomerInr: 50,
        advanceAutoInr: 20,
        cans: { can15: { qty: 1, rate: 50 } },
        notes: "Demo row — paid partly by UPI",
        settled: false,
      },
      {
        customer: "Example — Suresh Naik",
        vehicleNo: null,
        seedKg: 45,
        cakeOwnership: "CUSTOMER",
        advanceCustomerInr: 0,
        advanceAutoInr: 0,
        cans: {},
        notes: "Demo row — customer keeps cake",
        settled: true,
        settlementCustomerInr: 450,
        settlementAutoInr: 0,
        settlementRatePerKg: 10,
        settlementAmountInr: 450,
        settledAt: new Date(),
      },
    ],
  });

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  await prisma.dailyClosing.create({
    data: {
      date: yesterday.toISOString().slice(0, 10),
      session: "NIGHT",
      cashInOpening: 5000,
      cashInSales: 18000,
      cashInOther: 0,
      cashOutGrn: 480,
      cashOutExpenses: 1200,
      cashOutSalary: 0,
      cashOutUpi: 2000,
      cashOutDraw: 0,
      cashOutOther: 0,
      counterCashInr: 19300,
      systemCashInr: 19320,
      cashDiffInr: 20,
      cashMismatch: false,
      stock: {
        sf: { today: 120, reportSale: 18 },
        karadi1: { today: 95, reportSale: 12 },
        k2: { today: 40 },
      },
      createdAt: yesterday,
    },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
