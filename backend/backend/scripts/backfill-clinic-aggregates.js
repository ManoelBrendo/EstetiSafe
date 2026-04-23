require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

function addDays(date, days) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

function mapBillingStatusToClinicStatus(status) {
  return status === 'BLOCKED' ? 'SUSPENDED' : 'ACTIVE'
}

async function main() {
  const users = await prisma.user.findMany({
    include: {
      ownedClinic: {
        include: {
          subscription: true,
        },
      },
    },
  })

  const summary = {
    users: users.length,
    clinicsCreated: 0,
    clinicsUpdated: 0,
    subscriptionsCreated: 0,
  }

  for (const user of users) {
    const currentSubscription = user.ownedClinic?.subscription || null
    const clinicExists = Boolean(user.ownedClinic)
    const subscriptionExists = Boolean(currentSubscription)
    const subscriptionStatus = currentSubscription?.status || user.billingStatus || 'TRIAL'
    const clinicData = {
      name: user.clinicName,
      logoDataUrl: user.clinicLogoDataUrl || null,
      status: mapBillingStatusToClinicStatus(subscriptionStatus),
    }
    const subscriptionData = {
      status: subscriptionStatus,
      amount: currentSubscription?.amount ?? user.billingAmount ?? null,
      graceEndsAt: currentSubscription?.graceEndsAt || user.billingGraceEndsAt || addDays(user.createdAt, 7),
      lastPaidAt: currentSubscription?.lastPaidAt || user.billingLastPaidAt || null,
      nextDueAt: currentSubscription?.nextDueAt || user.billingNextDueAt || null,
      reference: currentSubscription?.reference ?? user.billingReference ?? null,
      notes: currentSubscription?.notes ?? user.billingNotes ?? null,
    }

    await prisma.clinic.upsert({
      where: { ownerUserId: user.id },
      update: {
        ...clinicData,
        subscription: {
          upsert: {
            create: subscriptionData,
            update: subscriptionData,
          },
        },
      },
      create: {
        ownerUserId: user.id,
        ...clinicData,
        subscription: {
          create: subscriptionData,
        },
      },
    })

    if (!clinicExists) {
      summary.clinicsCreated += 1
    } else {
      summary.clinicsUpdated += 1
    }

    if (!subscriptionExists) {
      summary.subscriptionsCreated += 1
    }
  }

  console.log(JSON.stringify(summary, null, 2))
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
