const Joi = require("@hapi/joi")

//register validation
const registerValidation = (data) => {
    const schema = Joi.object({
        firstName: Joi.string().min(1).max(255).required(),
        lastName: Joi.string().min(1).max(255).required(),
        email: Joi.string().min(5).required().email(),
        password: Joi.string().min(6).required(),
        role: Joi.string().pattern(new RegExp('^(SYSTEM_ADMIN|CLIENT_ADMIN)$')).required().messages({ "string.pattern.base": "Access denied." })
    })
    return schema.validate(data)
}

const loginValidation = (data) => {
    const schema = Joi.object({
        email: Joi.string().min(4).required().email(),
        password: Joi.string().min(6).required()
    })
    return schema.validate(data)
}

const updateValidation = (data) => {
    const schema = Joi.object({
        firstName: Joi.string().min(1).max(255).required(),
        lastName: Joi.string().min(1).max(255).required(),
        email: Joi.string().min(5).required().email(),
        role: Joi.string().pattern(/^(SYSTEM_ADMIN|CLIENT_ADMIN)$/).required().messages({ "string.pattern.base": "Access denied." })
    })
    return schema.validate(data)
}

const resetPasswordValidation = (data) => {
    const schema = Joi.object({
        password: Joi.string().min(6).required()
    })
    return schema.validate(data)
}

const getUsersValidation = (data) => {
    const schema = Joi.object({
        search: Joi.string().min(1).max(255),
        perPage: Joi.number().integer().min(1),
        sort_by: Joi.string().pattern(/^(firstName|lastName|email|date|role)$/).messages({ "string.pattern.base": "Sorter is undefined." }),
        page: Joi.number().integer().min(1),
    })
    return schema.validate(data)
}

const updatePermission = data => {
    const schema = Joi.object({
        isEnabled: Joi.boolean().required()
    })
    return schema.validate(data)
}

module.exports.registerValidation = registerValidation;
module.exports.loginValidation = loginValidation;
module.exports.updateValidation = updateValidation;
module.exports.resetPasswordValidation = resetPasswordValidation;
module.exports.getUsersValidation = getUsersValidation;
module.exports.updatePermission = updatePermission;