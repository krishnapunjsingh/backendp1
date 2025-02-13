import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.models.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const resisterUser = asyncHandler( async (req,res)=>{
    // get user details by frontend 
    // validation - not enmpty
    // check if user already exist : username, email
    // check for imazes , check for avatar
    // upload them to cloudinary, avatar
    // create user object - creata entry in db 
    // remove password and refersh token field from response 
    // check for user creation
    //return response 

    const {fullName, email,username, password} =req.body
    console.log("email", email)

    if(
        [fullName, email, username, password].some((field)=>
        field?.trim()==="")
    ){
        throw new ApiError(400, "All fields are required");
    }

    const existedUser = User.findOne({
        $or: [{username}, {email}]
    })

    if(existedUser){
        throw new ApiError(409, "User with eamil or username already exist")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImazeLocalPath = req.files?.coverImaze[0]?.path;

    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar field is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImaze = await uploadOnCloudinary(coverImazeLocalPath)

    if(!avatar){
        throw new ApiError(400, "Avatar field is required")
    }

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImaze: coverImaze?.url || "",
        email,
        password,
        username: username.toLoweCase
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering user");

    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User Registerd Successfully")
    )



})

export { resisterUser }