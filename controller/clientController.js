const Appointment = require("../model/Appointment");
const Clinic = require("../model/Clinic");
const Patient = require("../model/Patient");
const User = require("../model/User");
const VerificationContent = require("../model/VerificationContent");
const Terminal = require("../model/Terminal");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const {
  updateAppointmentValidation,
  getAppointmentsValidation,
  getTerminalsValidation,
  updateTerminalValidation,
} = require("../component/validation");
const axios = require('axios').default;

const getAppointmentById = async (req, res) => {
  const { appointmentId } = req.params;
  const appointment = await Appointment
    .findById(appointmentId)
    .populate("patient", "-appointments -__v")
    .select("-__v")
  if (!appointment) {
    return res.status(400).send({ error: "Invalid appointment ID." });
  }
  return res.status(200).send(appointment);
};

const deleteTerminal = async (req, res) => {
  const { terminalId } = req.params;

  try {
    const terminal = await Terminal.findById(terminalId);
    if (terminal.status == "DELETED") {
      return res
        .status(400)
        .send({ error: "The Terminal is already Deleted." });
    }
  } catch (err) {
    return res.status(400).send({ error: "Invalid Terminal Id." });
  }

  try {
    await Terminal.findByIdAndUpdate(terminalId, {
      status: "DELETED",
    });
    return res.status(200).send("Terminal Deleted");
  } catch (err) {
    return res.status(400).send({ error: "Failed to update Terminal." });
  }
};

const createTerminal = async (req, res) => {
  const { terminalName } = req.params;
  const userId = req.user._id;
  const verificationContent = new VerificationContent();
  const user = await User.findById(userId);

  try {
    await verificationContent.save()
    //successfully
  } catch (err) {
    return res.status(400).send({ error: err })
  }
  try {
    const terminalExists =
      (await Terminal.findOne({
        name: terminalName,
        status: "DISABLED",
      })) +
      (await Terminal.findOne({
        name: terminalName,
        status: "ENABLED",
      }));
    if (terminalExists) {
      return res.status(400).send({ error: "The Terminal is already exists." });
    }
  } catch (err) {
    return res.status(400).send({ error: "Invalid Terminal Name." });
  }

  //Create token //shorten token
  const maxTokenAttempt = await Terminal.countDocuments()
  for (var i = 0; i < maxTokenAttempt; i++) {
    const token2 = String(
      jwt.sign(
        { _id: String((Math.random() * 1000000) + 1000000).substring(1, 7) },
        process.env.TOKEN_SECRET
      )
    )
      .substring(100, 106).toUpperCase()
    try {
      const tokenExists = await Terminal.findOne({
        token: token2,
      });
      if (tokenExists) {
        if (i == maxTokenAttempt - 1) {
          return res.status(400).send({ error: "Toke Creation Failed." });
        }
      } else {
        i = maxTokenAttempt;
        var token = token2;
      }
    } catch (err) {
      return res.status(400).send({ error: "Invalid Terminal request." });
    }
  }

  const terminal = new Terminal({
    name: terminalName,
    token: token,
    creationDate: Date.now(),
    status: "DISABLED",
    verificationContent: verificationContent._id,
    clinic: user.clinic,
  });

  try {
    terminal.save();
    return res.status(201).send("Successfully created terminal");
  } catch (err) {
    return res.status(400).send({ error: err });
  }
};

const updateAppointmentById = async (req, res) => {
  const { error } = updateAppointmentValidation(req.body);
  if (error) {
    return res.status(400).send(error.details[0].message);
  }
  const { appointmentId } = req.params;
  let appointment = await Appointment.findById(appointmentId).select("-__v");
  // Check if appointment exists
  if (!appointment) {
    return res.status(400).send({ error: "Invalid appointment ID." });
  }
  // Update appointment in clinic
  try {
    if (appointment.clinic && appointment.clinic != req.body.clinic) {
      const oldClinic = await Clinic.findById(appointment.clinic);
      oldClinic.appointments.pull(appointment._id);
      await oldClinic.save();
      const newClinic = await Clinic.findById(req.body.clinic);
      newClinic.appointments.push(appointment._id);
      await newClinic.save();
    } else if (!appointment.clinic && req.body.clinic) {
      const newClinic = await Clinic.findById(req.body.clinic);
      newClinic.appointments.push(appointment._id);
      await newClinic.save();
    }
  } catch (err) {
    return res
      .status(400)
      .send({ error: "Failed to update appointment in clinic." });
  }
  // Update appointment in patient
  try {
    if (appointment.patient && appointment.patient != req.body.patient) {
      const oldPatient = await Patient.findById(appointment.patient);
      oldPatient.appointments.pull(appointment._id);
      await oldPatient.save();
      const newPatient = await Patient.findById(req.body.patient);
      newPatient.appointments.push(appointment._id);
      await newPatient.save();
    } else if (!appointment.patient && req.body.patient) {
      const newPatient = await Patient.findById(req.body.patient);
      newPatient.appointments.push(appointment._id);
      await newPatient.save();
    }
  } catch (err) {
    return res
      .status(400)
      .send({ error: "Failed to update appointment in patient." });
  }
  // Update clinic and patient in appointment
  try {
    appointment.appointmentTime = req.body.appointmentTime
    appointment.doctorName = req.body.doctorName
    appointment.reason = req.body.reason
    appointment.status = req.body.status
    appointment.comment = req.body.comment
    appointment.clinic = req.body.clinic
    appointment.patient = req.body.patient
    await appointment.save()
    return res.status(200).send(appointment);
  } catch (err) {
    return res.status(400).send({ error: "Failed to update appointment." });
  }
};

const getAppointments = async (req, res) => {
  const { error } = getAppointmentsValidation(req.query);
  if (error) {
    return res.status(400).send(error.details[0].message);
  }
  const userId = req.user._id;
  const {
    page = 1,
    perPage = 10,
    sort_by = "appointmentTime.asc",
    search,
    start_date,
    end_date,
  } = req.query;
  const _page = Number(page);
  const _perPage = Number(perPage);
  let startDate;
  let endDate;
  if (start_date) {
    startDate = new Date(start_date);
    startDate.setMinutes(startDate.getMinutes() + startDate.getTimezoneOffset())
  } else {
    startDate = new Date();
  }

  if (end_date) {
    endDate = new Date(end_date);
    endDate.setMinutes(endDate.getMinutes() + endDate.getTimezoneOffset());
    if (endDate < startDate) {
      return res
        .status(400)
        .send({ error: "End date must be greater than start date." });
    }
  } else {
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 1);
  }

  const searchString = new RegExp(search, "i");
  let sorter = {};
  sorter[sort_by.substring(0, sort_by.lastIndexOf("."))] =
    sort_by.indexOf(".asc") != -1 ? 1 : -1;

  try {
    const user = await User.findById(userId);
    let appointments = await Appointment.aggregate([
      {
        $lookup: {
          from: Patient.collection.name,
          localField: "patient",
          foreignField: "_id",
          as: "patient",
        },
      },
      {
        $match: {
          clinic: user.clinic,
          appointmentTime: { $gte: startDate, $lte: endDate },
          $or: [
            { doctorName: searchString },
            { reason: searchString },
            { comment: searchString },
            { "patient.firstName": searchString },
            { "patient.lastName": searchString },
            { "patient.careCardNumber": searchString },
            { "patient.phoneNumber": searchString },
            { "patient.email": searchString },
          ],
        },
      },
      {
        $facet: {
          metadata: [{ $count: "totalResults" }],
          data: [
            { $sort: sorter },
            { $skip: (_page - 1) * _perPage },
            { $limit: _perPage },
            { $project: { __v: 0, "patient.__v": 0, "patient.appointments": 0 } },
          ],
        },
      },
    ]);

    appointments = appointments[0];
    const total = appointments.metadata[0]
      ? appointments.metadata[0].totalResults
      : 0;
    appointments.metadata = {
      currentPage: _page,
      perPage: _perPage,
      totalResults: total,
      totalPages: Math.ceil(total / _perPage),
      nextPage: _page + 1 > Math.ceil(total / _perPage) ? null : _page + 1,
      prevPage: _page - 1 <= 0 ? null : _page - 1,
    };
    return res.status(200).send(appointments);
  } catch (err) {
    console.log(err);
    return res.status(400).send({ error: "Failed to get appointments." });
  }
};

const getVerificationContent = async (req, res) => {
  const { terminalId } = req.params;

  try {
    let terminal = await Terminal.aggregate([
      {
        $lookup: {
          from: VerificationContent.collection.name,
          localField: "verificationContent",
          foreignField: "_id",
          as: "verificationContent",
        },
      },
      {
        $match: {
          _id: mongoose.Types.ObjectId(terminalId),
          status: "ENABLED",
        },
      },
    ]);

    if (terminal == "") {
      return res
        .status(400)
        .send({ error: "No Active Terminal" });
    }
    return res.status(200).send({ terminal });
  } catch (err) {
    return res.status(400).send({ error: "Invalid data request." });
  }
};

const getTerminalById = async (req, res) => {
  const { terminalId } = req.params;
  try {
    let terminal = await Terminal.aggregate([
      {
        $lookup: {
          from: VerificationContent.collection.name,
          localField: "verificationContent",
          foreignField: "_id",
          as: "verificationContent",
        },
      },
      {
        $match: {
          _id: mongoose.Types.ObjectId(terminalId),
          // status: "ENABLED",
        },
      },
    ]);
    return res.status(200).send({ terminal });
  } catch (err) {
    return res.status(400).send({ error: "Invalid data request." });
  }
};

const getTerminals = async (req, res) => {
  const { error } = getTerminalsValidation(req.query);
  if (error) {
    return res.status(400).send(error.details[0].message);
  }
  const userId = req.user._id;
  const { search, sort_by = "name.asc", page = 1, perPage = 10 } = req.query;
  const _page = Number(page);
  const _perPage = Number(perPage);
  const searchString = new RegExp(search, "i");
  let sorter = {};
  sorter[sort_by.split(".")[0]] = sort_by.indexOf(".asc") != -1 ? 1 : -1;

  try {
    const user = await User.findById(userId);
    let terminals = await Terminal.aggregate([
      {
        $lookup: {
          from: VerificationContent.collection.name,
          localField: "verificationContent",
          foreignField: "_id",
          as: "verificationContent",
        },
      },
      {
        $match: {
          clinic: user.clinic,
          name: searchString,
        },
      },
      {
        $facet: {
          metadata: [{ $count: "totalResults" }],
          data: [
            { $sort: sorter },
            { $skip: (_page - 1) * _perPage },
            { $limit: _perPage },
            { $project: { __v: 0, "verificationContent.__v": 0 } },
          ],
        },
      },
    ]);

    terminals = terminals[0];
    const total = terminals.metadata[0]
      ? terminals.metadata[0].totalResults
      : 0;
    terminals.metadata = {
      currentPage: _page,
      perPage: _perPage,
      totalResults: total,
      totalPages: Math.ceil(total / _perPage),
      nextPage: _page + 1 > Math.ceil(total / _perPage) ? null : _page + 1,
      prevPage: _page - 1 <= 0 ? null : _page - 1,
    };
    return res.status(200).send(terminals);
  } catch (err) {
    console.log(err);
    return res.status(400).send({ error: "Failed to get terminals." });
  }
};

const updateTerminalById = async (req, res) => {
  const { error } = updateTerminalValidation(req.body);
  if (error) {
    return res.status(400).send(error.details[0].message);
  }
  const { terminalId } = req.params;
  let terminal = await Terminal.findById(terminalId);
  // Check if terminal exists
  if (!terminal) {
    return res.status(400).send({ error: "Invalid terminal ID." });
  }
  if (terminal.status == "DELETED") {
    return res
      .status(400)
      .send({ error: "Updating deleted terminal is not allowed." });
  }
  // Find verification content
  try {
    if (req.body.verificationContent) {
      await VerificationContent.findByIdAndUpdate(
        terminal.verificationContent,
        JSON.parse(req.body.verificationContent)
      );
    }
  } catch (err) {
    return res
      .status(400)
      .send({ error: "Failed to update verification content." });
  }
  // Update clinic and verfication content in terminal
  let json = {};
  if (req.body.name) {
    json.name = req.body.name;
  }
  if (req.body.status) {
    json.status = req.body.status;
  }
  try {
    await terminal.update(json);
    await terminal.save();
    terminal = await Terminal.findById(terminal._id)
      .populate("verificationContent", "-__v -_id")
      .select("-__v")
      .exec();
    return res.status(200).send(terminal);
  } catch (err) {
    console.log(err);
    return res.status(400).send({ error: "Failed to update terminal." });
  }
};

const createDummyAppointments = async (req, res) => {
  const { start_time, end_time, step = 5 } = req.body
  let startTime, endTime
  if (step && (typeof step != "number" || step % 1 != 0 || step < 5)) {
    return res.status(400).send({ error: 'Step must be an integer and not less than 5.' })
  }

  try {
    if (!start_time) {
      startTime = new Date()
      startTime.setMinutes(0)
      startTime.setSeconds(0)
    } else {
      startTime = new Date(start_time)
    }

    if (!end_time) {
      endTime = new Date(startTime)
      endTime.setHours(startTime.getHours() + 1)
      endTime.setMinutes(59)
      endTime.setMinutes(59)
    } else {
      if (new Date(startTime) > new Date(end_time)) {
        return res.status(400).send({ error: 'End time must be greater than start time.' })
      }
      endTime = new Date(end_time)
    }
  } catch (err) {
    return res.status(400).send({ error: 'Invalid start time/end time.' })
  }

  try {
    let numberOfPatients = await Patient.countDocuments()
    const target = 20
    if (numberOfPatients < target) {
      axios.get(`https://randomuser.me/api/?results=${target - numberOfPatients}&inc=name,gender,dob,email,phone&noinfo`)
        .then(response => {
          response.data.results.forEach(async person => {
            let patient = new Patient({
              firstName: person.name.first,
              lastName: person.name.last,
              email: person.email,
              phoneNumber: person.phone,
              mrp: "NA",
              careCardNumber: "123456789",
              comment: "NA",
              gender: person.gender.toUpperCase(),
              dateOfBirth: person.dob.date.substring(0, person.dob.date.indexOf('T'))
            })
            await patient.save()
          })
        })
        .catch(error => {
          console.log(error)
        })
    }

    const patients = await Patient.find().limit(target)
    const user = await User.findById(req.user._id)
    let clinic = await Clinic.findById(user.clinic)
    let count = 0
    while (startTime <= endTime) {
      if (count > 1000) {
        return res.status(200).send({
          details: "First 1000 insertion is finished.",
          lastStartTime: startTime
        })
      }

      let patient = patients[Math.floor(Math.random() * target)]
      let appointment = new Appointment({
        doctorName: 'Dr Strange',
        comment: 'NA',
        reason: 'Cold',
        status: 'PENDING',
        appointmentTime: startTime,
        clinic: user.clinic,
        patient: patient._id
      })
      await appointment.save()
      patient.appointments.push(appointment._id)
      await patient.save()
      clinic.appointments.push(appointment._id)
      await clinic.save()
      startTime.setMinutes(startTime.getMinutes() + step)
      count++
    }
    return res.status(200).send({ details: "Data seeding finished." })
  } catch (err) {
    console.log(err)
    return res.status(400).send({ error: 'Failed to seed data.' })
  }
}

module.exports.getAppointmentById = getAppointmentById;
module.exports.getAppointments = getAppointments;
module.exports.updateAppointmentById = updateAppointmentById;

module.exports.getTerminals = getTerminals;
module.exports.getTerminalById = getTerminalById;
module.exports.deleteTerminal = deleteTerminal;
module.exports.createTerminal = createTerminal;
module.exports.updateTerminalById = updateTerminalById;

module.exports.getVerificationContent = getVerificationContent;

module.exports.createDummyAppointments = createDummyAppointments;
